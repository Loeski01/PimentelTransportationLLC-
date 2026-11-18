'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {Client}=require('pg');
const {persistBookingChange}=require('./persist-modification');
const {notificationHealth}=require('./notification-health');
const {deliverBookingNotification}=require('./notification-outbox');
async function run(){
 const client=new Client({connectionString:process.env.TEST_DATABASE_URL});
 await client.connect();
 try {
  await client.query('CREATE SCHEMA pt_integration_test');
  await client.query('SET search_path TO pt_integration_test');
  await client.query(fs.readFileSync(require('node:path').join(__dirname,'postgres-schema-draft.sql'),'utf8'));
  const inserted=await client.query(`INSERT INTO pt_customer_bookings(reference,customer_name,customer_email,customer_phone,passengers,trip_type,tier,status,outbound,return_leg,fare_cents)
 VALUES ('PT-INTEGRATION-01','Test Customer','old@example.test','5550000000','2','round_trip','luxury','confirmed',
 '{"from":"Boston","to":"Cambridge","date":"2026-12-01","time":"10:00"}'::jsonb,
 '{"date":"2026-12-02","time":"14:00"}'::jsonb,20000) RETURNING id`);
  const before={reference:'PT-INTEGRATION-01',name:'Test Customer',tripType:'round_trip',status:'confirmed',from:'Boston',to:'Cambridge',date:'2026-12-01',time:'10:00',returnDate:'2026-12-02',returnTime:'14:00',phone:'5550000000',email:'old@example.test',passengers:'2'};
  const changed=await persistBookingChange({client,bookingId:Number(inserted.rows[0].id),expectedVersion:1,before,patch:{time:'11:00',phone:'5551234567',email:'new@example.test',passengers:'3'},previousFareCents:20000,newFareCents:21000,notificationEmail:'admin@example.test'});
  assert.equal(changed.version,2);
  const row=(await client.query('SELECT outbound,customer_phone,customer_email,passengers,fare_cents,version FROM pt_customer_bookings WHERE id=$1',[inserted.rows[0].id])).rows[0];
  assert.equal(row.outbound.time,'11:00');
  assert.equal(row.customer_phone,'5551234567');
  assert.equal(row.customer_email,'new@example.test');
  assert.equal(row.passengers,'3');
  assert.equal(Number(row.fare_cents),21000);
  const health=await notificationHealth({client});
  assert.equal(health.due,1);
  let sends=0;
  const result=await deliverBookingNotification({client,eventId:changed.eventId,send:async()=>{sends++;throw Error('ambiguous timeout')}});
  assert.equal(result.requiresReconciliation,true);
  assert.equal(sends,1);
  const state=(await client.query('SELECT status,attempts FROM pt_booking_notification_outbox WHERE event_id=$1',[changed.eventId])).rows[0];
  assert.equal(state.status,'sending');
  const again=await deliverBookingNotification({client,eventId:changed.eventId,send:async()=>{sends++;return {accepted:true}}});
  assert.equal(again.claimed,false);
  assert.equal(sends,1);
  // Real database concurrency guard: stale edits must not mutate the booking or create events.
  const eventsBefore=Number((await client.query('SELECT count(*) AS n FROM pt_booking_change_events')).rows[0].n);
  await assert.rejects(
   persistBookingChange({client,bookingId:Number(inserted.rows[0].id),expectedVersion:1,before,patch:{time:'12:00'},previousFareCents:20000,newFareCents:22000,notificationEmail:'admin@example.test'}),
   error=>error.code==='BOOKING_CONFLICT'
  );
  const afterConflict=(await client.query('SELECT version,fare_cents,outbound FROM pt_customer_bookings WHERE id=$1',[inserted.rows[0].id])).rows[0];
  assert.equal(Number(afterConflict.version),2);
  assert.equal(Number(afterConflict.fare_cents),21000);
  assert.equal(afterConflict.outbound.time,'11:00');
  assert.equal(Number((await client.query('SELECT count(*) AS n FROM pt_booking_change_events')).rows[0].n),eventsBefore);
  // Real database constraints reject invalid required contact values.
  await assert.rejects(client.query('UPDATE pt_customer_bookings SET customer_email=NULL WHERE id=$1',[inserted.rows[0].id]),error=>error.code==='23502');
  const intact=(await client.query('SELECT customer_email FROM pt_customer_bookings WHERE id=$1',[inserted.rows[0].id])).rows[0];
  assert.equal(intact.customer_email,'new@example.test');
  // A successful provider acceptance is recorded once, without duplicate sends.
  const acceptedEvent=await persistBookingChange({client,bookingId:Number(inserted.rows[0].id),expectedVersion:2,before:{...before,time:'11:00',phone:'5551234567',email:'new@example.test',passengers:'3'},patch:{time:'11:30'},previousFareCents:21000,newFareCents:21500,notificationEmail:'admin@example.test'});
  let acceptedSends=0;
  const accepted=await deliverBookingNotification({client,eventId:acceptedEvent.eventId,send:async()=>{acceptedSends++;return {accepted:true}}});
  assert.equal(accepted.accepted,true);
  const acceptedState=(await client.query('SELECT status,attempts FROM pt_booking_notification_outbox WHERE event_id=$1',[acceptedEvent.eventId])).rows[0];
  assert.equal(acceptedState.status,'accepted');
  assert.equal(Number(acceptedState.attempts),1);
  const duplicate=await deliverBookingNotification({client,eventId:acceptedEvent.eventId,send:async()=>{acceptedSends++;return {accepted:true}}});
  assert.equal(duplicate.claimed,false);
  assert.equal(acceptedSends,1);
  const finalBooking=(await client.query('SELECT version,fare_cents,outbound FROM pt_customer_bookings WHERE id=$1',[inserted.rows[0].id])).rows[0];
  assert.equal(Number(finalBooking.version),3);
  assert.equal(Number(finalBooking.fare_cents),21500);
  assert.equal(finalBooking.outbound.time,'11:30');
  // Explicit provider rejection should queue retry, never roll back a confirmed booking edit.
  const rejectedEvent=await persistBookingChange({client,bookingId:Number(inserted.rows[0].id),expectedVersion:3,before:{...before,time:'11:30',phone:'5551234567',email:'new@example.test',passengers:'3'},patch:{time:'12:00'},previousFareCents:21500,newFareCents:22000,notificationEmail:'admin@example.test'});
  let rejectedSends=0;
  const rejected=await deliverBookingNotification({client,eventId:rejectedEvent.eventId,send:async()=>{rejectedSends++;throw Object.assign(Error('provider rejected'),{deliveryOutcome:'rejected'})}});
  assert.equal(rejected.retryQueued,true);
  assert.equal(rejectedSends,1);
  const retryRow=(await client.query('SELECT status,attempts,next_attempt_at>now() AS future FROM pt_booking_notification_outbox WHERE event_id=$1',[rejectedEvent.eventId])).rows[0];
  assert.equal(retryRow.status,'retry');
  assert.equal(Number(retryRow.attempts),1);
  assert.equal(retryRow.future,true);
  const premature=await deliverBookingNotification({client,eventId:rejectedEvent.eventId,send:async()=>{rejectedSends++;return {accepted:true}}});
  assert.equal(premature.claimed,false);
  assert.equal(rejectedSends,1);
  const durable=(await client.query('SELECT version,fare_cents,outbound FROM pt_customer_bookings WHERE id=$1',[inserted.rows[0].id])).rows[0];
  assert.equal(Number(durable.version),4);
  assert.equal(Number(durable.fare_cents),22000);
  assert.equal(durable.outbound.time,'12:00');
  // Once dispatch has started, edits must fail without touching audit or outbox.
  await client.query("UPDATE pt_customer_bookings SET status='en_route' WHERE id=$1",[inserted.rows[0].id]);
  const eventCountBefore=Number((await client.query('SELECT count(*) AS n FROM pt_booking_change_events')).rows[0].n);
  const outboxCountBefore=Number((await client.query('SELECT count(*) AS n FROM pt_booking_notification_outbox')).rows[0].n);
  await assert.rejects(
    persistBookingChange({client,bookingId:Number(inserted.rows[0].id),expectedVersion:4,before:{...before,status:'confirmed',time:'12:00',phone:'5551234567',email:'new@example.test',passengers:'3'},patch:{time:'12:30'},previousFareCents:22000,newFareCents:22500,notificationEmail:'admin@example.test'}),
    error=>error.code==='BOOKING_CONFLICT'
  );
  const blocked=(await client.query('SELECT status,version,fare_cents,outbound FROM pt_customer_bookings WHERE id=$1',[inserted.rows[0].id])).rows[0];
  assert.equal(blocked.status,'en_route');
  assert.equal(Number(blocked.version),4);
  assert.equal(Number(blocked.fare_cents),22000);
  assert.equal(blocked.outbound.time,'12:00');
  assert.equal(Number((await client.query('SELECT count(*) AS n FROM pt_booking_change_events')).rows[0].n),eventCountBefore);
  assert.equal(Number((await client.query('SELECT count(*) AS n FROM pt_booking_notification_outbox')).rows[0].n),outboxCountBefore);
  console.log('Isolated PostgreSQL integration checks passed');
 } finally {
  await client.query('DROP SCHEMA IF EXISTS pt_integration_test CASCADE');
  await client.end();
 }
}
run().catch(e=>{console.error(e);process.exitCode=1});

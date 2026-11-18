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
  console.log('Isolated PostgreSQL integration checks passed');
 } finally {
  await client.query('DROP SCHEMA IF EXISTS pt_integration_test CASCADE');
  await client.end();
 }
}
run().catch(e=>{console.error(e);process.exitCode=1});

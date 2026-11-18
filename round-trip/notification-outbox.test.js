'use strict';
const assert=require('node:assert/strict');
const {deliverBookingNotification}=require('./notification-outbox');
const eventId='123e4567-e89b-42d3-a456-426614174000';
function db({claim=true,attempts=1}={}) {
 const calls=[];
 return {calls,async query(sql,args) {
   calls.push({sql,args});
   if(sql.includes('RETURNING event_id,recipient_email,attempts'))
     return claim?{rowCount:1,rows:[{event_id:eventId,recipient_email:'admin@example.com',attempts}]}:{rowCount:0,rows:[]};
   if(sql.includes('FROM pt_booking_change_events e')) return {rowCount:1,rows:[{event_id:eventId,booking_id:7,reference:'PT-TEST',customer_name:'Test Passenger',changes:[{field:'time',oldValue:'10:00',newValue:'11:00'}],previous_fare_cents:20000,new_fare_cents:21000}]};
   return {rowCount:1,rows:[]};
 }};
}
async function run() {
 const success=db();
 let sent=0;
 const ok=await deliverBookingNotification({client:success,eventId,send:async args=>{
   sent++;assert.equal(args.recipientEmail,'admin@example.com');assert.equal(args.booking.reference,'PT-TEST');assert.equal(args.booking.new_fare_cents,21000);return {accepted:true};
 }});
 assert.equal(sent,1);
 assert.deepEqual(ok,{claimed:true,accepted:true});
 assert.match(success.calls.at(-1).sql,/status='accepted'/);
 assert.match(success.calls[0].sql,/sending_started_at=now\(\)/);
 assert.match(success.calls.at(-1).sql,/sending_started_at=NULL/);
 const busy=db({claim:false});
 const notClaimed=await deliverBookingNotification({client:busy,eventId,send:async()=>{throw Error('must not send')}});
 assert.deepEqual(notClaimed,{claimed:false});
 const retry=db({attempts:2});
 const failed=await deliverBookingNotification({client:retry,eventId,send:async()=>{throw Error('provider down')}});
 assert.deepEqual(failed,{claimed:true,accepted:false,retryQueued:true,permanentlyFailed:false});
 assert.match(retry.calls.at(-1).sql,/status=CASE WHEN attempts>=5 THEN 'failed'/);
 assert.match(retry.calls.at(-1).sql,/sending_started_at=NULL/);
 const exhausted=db({attempts:5});
 const stopped=await deliverBookingNotification({client:exhausted,eventId,send:async()=>({accepted:false})});
 assert.deepEqual(stopped,{claimed:true,accepted:false,retryQueued:false,permanentlyFailed:true});
 await assert.rejects(()=>deliverBookingNotification({client:db(),eventId:'bad',send:async()=>({accepted:true})}),/Invalid event ID/);
 console.log('Notification outbox mock tests passed (11 assertions)');
}
run().catch(e=>{console.error(e);process.exitCode=1});

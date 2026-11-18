'use strict';
const assert=require('node:assert/strict');
const {persistBookingChange}=require('./persist-modification');
const before={reference:'PT-TEST',name:'Test',tripType:'round_trip',status:'confirmed',from:'Boston',to:'Cambridge',date:'2026-12-01',time:'10:00',returnDate:'2026-12-02',returnTime:'14:00'};
function mock({conflict=false,failOutbox=false}={}) {
 const calls=[];
 return {calls,async query(sql,args=[]) {
   calls.push({sql,args});
   if(sql.includes('UPDATE pt_customer_bookings')) return conflict?{rowCount:0,rows:[]}:{rowCount:1,rows:[{reference:'PT-TEST',version:3}]};
   if(failOutbox&&sql.includes('INSERT INTO pt_booking_notification_outbox')) throw Error('outbox unavailable');
   return {rowCount:1,rows:[]};
 }};
}
async function run(){
 const db=mock();
 const result=await persistBookingChange({client:db,bookingId:7,expectedVersion:2,before,patch:{time:'11:00'},previousFareCents:20000,newFareCents:21000,notificationEmail:'admin@example.com'});
 assert.equal(result.notificationQueued,true);
 assert.equal(result.version,3);
 assert.equal(db.calls[0].sql,'BEGIN');
 assert.equal(db.calls.at(-1).sql,'COMMIT');
 assert.equal(db.calls.filter(c=>c.sql.includes('INSERT INTO pt_booking_change_events')).length,1);
 assert.equal(db.calls.filter(c=>c.sql.includes('INSERT INTO pt_booking_notification_outbox')).length,1);
 const update=db.calls.find(c=>c.sql.includes('UPDATE pt_customer_bookings'));
 assert.match(update.sql,/reference=\$6 AND fare_cents=\$7/);
 assert.match(update.sql,/outbound=\$8::jsonb/);
 assert.match(update.sql,/return_leg IS NOT DISTINCT FROM \$9::jsonb/);
 assert.equal(update.args[5],'PT-TEST');
 assert.equal(update.args[6],20000);
 assert.deepEqual(JSON.parse(update.args[7]),{from:'Boston',to:'Cambridge',date:'2026-12-01',time:'10:00'});
 assert.deepEqual(JSON.parse(update.args[8]),{date:'2026-12-02',time:'14:00'});
 const conflict=mock({conflict:true});
 await assert.rejects(()=>persistBookingChange({client:conflict,bookingId:7,expectedVersion:2,before,patch:{time:'11:00'},previousFareCents:20000,newFareCents:21000,notificationEmail:'admin@example.com'}),{code:'BOOKING_CONFLICT'});
 assert.equal(conflict.calls.at(-1).sql,'ROLLBACK');
 const failure=mock({failOutbox:true});
 await assert.rejects(()=>persistBookingChange({client:failure,bookingId:7,expectedVersion:2,before,patch:{time:'11:00'},previousFareCents:20000,newFareCents:21000,notificationEmail:'admin@example.com'}),/outbox unavailable/);
 assert.equal(failure.calls.at(-1).sql,'ROLLBACK');
 const contact=mock();
 const contactBefore={...before,phone:'5550000000',email:'old@example.com',passengers:'2'};
 await persistBookingChange({client:contact,bookingId:7,expectedVersion:2,before:contactBefore,patch:{phone:'5551234567',email:'new@example.com',passengers:'3'},previousFareCents:20000,newFareCents:21000,notificationEmail:'admin@example.com'});
 const contactUpdate=contact.calls.find(c=>c.sql.includes('UPDATE pt_customer_bookings'));
 assert.deepEqual(contactUpdate.args.slice(9),['5551234567','new@example.com','3','5550000000','old@example.com','2']);
 assert.match(contactUpdate.sql,/customer_phone IS NOT DISTINCT FROM \$13/);
 assert.equal(contact.calls.at(-1).sql,'COMMIT');
 console.log('Persistence mock transaction tests passed (20 assertions)');
}
run().catch(e=>{console.error(e);process.exitCode=1});

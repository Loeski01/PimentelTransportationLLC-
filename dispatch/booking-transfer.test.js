'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createPendingTripFromBooking}=require('./booking-transfer');
const payload={booking_reference:'PT-ABC123',passenger_surname:'Castillo',pickup_address:'Logan Airport',destination_address:'Woburn',pickup_at:'2026-11-14T14:30:00-05:00'};
function fakePool(exists=false) {
 const calls=[];
 const client={query:async(sql,params)=>{calls.push({sql,params});
 if(sql.startsWith('INSERT INTO dispatch_trips'))return exists?{rowCount:0,rows:[]}:{rowCount:1,rows:[{id:9,status:'pending'}]};
 if(sql.startsWith('SELECT id,status'))return {rowCount:1,rows:[{id:9,status:'approved'}]};
 return {rowCount:1,rows:[]};
 },release:()=>calls.push({sql:'RELEASE'})};
 return {calls,connect:async()=>client};
}
test('new booking creates one pending trip and one audit entry',async()=>{
 const db=fakePool();const result=await createPendingTripFromBooking(db,payload);
 assert.deepEqual(result,{id:9,status:'pending',created:true});
 assert.equal(db.calls.filter(c=>c.sql.startsWith('INSERT INTO dispatch_audit')).length,1);
 assert.equal(db.calls.filter(c=>c.sql==='COMMIT').length,1);
});
test('repeated booking reference returns existing trip and no new audit',async()=>{
 const db=fakePool(true);const result=await createPendingTripFromBooking(db,payload);
 assert.deepEqual(result,{id:9,status:'approved',created:false});
 assert.equal(db.calls.filter(c=>c.sql.startsWith('INSERT INTO dispatch_audit')).length,0);
});
test('missing reference rejected before DB connection',async()=>{
 const db=fakePool();await assert.rejects(createPendingTripFromBooking(db,{...payload,booking_reference:''}),/Invalid/);
 assert.equal(db.calls.length,0);
});

test('UTC timestamp is accepted',async()=>{
 const db=fakePool();const result=await createPendingTripFromBooking(db,{...payload,pickup_at:'2026-11-14T19:30:00Z'});
 assert.equal(result.status,'pending');
});
test('timestamp without timezone is rejected',async()=>{
 const db=fakePool();await assert.rejects(createPendingTripFromBooking(db,{...payload,pickup_at:'2026-11-14T14:30:00'}),/Invalid/);
 assert.equal(db.calls.length,0);
});

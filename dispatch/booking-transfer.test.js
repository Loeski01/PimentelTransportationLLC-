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

test('audit failure rolls back trip creation and releases connection',async()=>{
 const calls=[];
 const client={query:async(sql)=>{
   calls.push(sql);
   if(sql.startsWith('INSERT INTO dispatch_trips'))return {rowCount:1,rows:[{id:12,status:'pending'}]};
   if(sql.startsWith('INSERT INTO dispatch_audit'))throw new Error('audit unavailable');
   return {rowCount:1,rows:[]};
 },release:()=>calls.push('RELEASE')};
 await assert.rejects(createPendingTripFromBooking({connect:async()=>client},payload),/audit unavailable/);
 assert.ok(calls.includes('ROLLBACK'));
 assert.ok(!calls.includes('COMMIT'));
 assert.equal(calls.at(-1),'RELEASE');
});

test('import does not copy fare, contact details or assign a driver',async()=>{
 const db=fakePool();
 await createPendingTripFromBooking(db,{...payload,passenger_phone:'6175550100',passenger_email:'test@example.com',fare_cents:9900,driver_id:8});
 const insert=db.calls.find(c=>c.sql.startsWith('INSERT INTO dispatch_trips'));
 assert.ok(insert);
 assert.ok(!/fare_cents|passenger_phone|passenger_email|driver_id/.test(insert.sql));
 assert.equal(insert.params.length,5);
 assert.equal(db.calls.filter(c=>c.sql==='COMMIT').length,1);
});
test('unresolved duplicate reference rolls back instead of inventing a trip',async()=>{
 const calls=[];
 const client={query:async(sql)=>{
  calls.push(sql);
  if(sql.startsWith('INSERT INTO dispatch_trips'))return {rowCount:0,rows:[]};
  if(sql.startsWith('SELECT id,status'))return {rowCount:0,rows:[]};
  return {rowCount:1,rows:[]};
 },release:()=>calls.push('RELEASE')};
 await assert.rejects(createPendingTripFromBooking({connect:async()=>client},payload),/conflict not resolved/);
 assert.ok(calls.includes('ROLLBACK'));
 assert.ok(!calls.includes('COMMIT'));
 assert.equal(calls.at(-1),'RELEASE');
});

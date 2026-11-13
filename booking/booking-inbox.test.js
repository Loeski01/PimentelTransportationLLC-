'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {saveBookingRequest}=require('./booking-inbox');
const booking={reference:'PT-ABC123',name:'Maria Castillo',phone:'6175550100',email:'maria@example.com',from:'Logan Airport',to:'Woburn, MA',date:'2026-11-14',time:'14:30',passengers:'2',tier:'luxury',fareCents:6500,tipCents:975,payment:'later',details:'Child seat'};
function fakeDb(existing=false) {
 const calls=[];
 return {calls,query:async(sql,values)=>{
  calls.push({sql,values});
  if(sql.startsWith('INSERT')) return existing?{rowCount:0,rows:[]}:{rowCount:1,rows:[{id:7,reference:booking.reference,status:'received'}]};
  return {rowCount:1,rows:[{id:7,reference:booking.reference,status:'received'}]};
 }};
}
test('persists full booking request as received',async()=>{
 const db=fakeDb();const r=await saveBookingRequest(db,booking);
 assert.equal(r.created,true);assert.equal(r.booking.status,'received');
 assert.equal(db.calls[0].values.length,14);
 assert.equal(db.calls[0].values[3],'maria@example.com');
 assert.equal(db.calls[0].values[13],'Child seat');
});
test('duplicate reference returns existing inbox record',async()=>{
 const db=fakeDb(true);const r=await saveBookingRequest(db,booking);
 assert.equal(r.created,false);assert.equal(db.calls.length,2);
});
test('rejects invalid reference before database write',async()=>{
 const db=fakeDb();await assert.rejects(saveBookingRequest(db,{...booking,reference:'bad'}),/reference/);
 assert.equal(db.calls.length,0);
});
test('rejects invalid local time before database write',async()=>{
 const db=fakeDb();await assert.rejects(saveBookingRequest(db,{...booking,time:'25:99'}),/date\/time/);
 assert.equal(db.calls.length,0);
});
test('rejects unsupported payment preference',async()=>{
 const db=fakeDb();await assert.rejects(saveBookingRequest(db,{...booking,payment:'credit_card'}),/options/);
 assert.equal(db.calls.length,0);
});

test('duplicate reference with missing database row fails safely',async()=>{
 const calls=[];
 const db={query:async(sql)=>{calls.push(sql);return {rowCount:0,rows:[]}}};
 await assert.rejects(saveBookingRequest(db,booking),/idempotency conflict unresolved/);
 assert.equal(calls.length,2);
});
test('rejects negative fare and tip before database writes',async()=>{
 for(const patch of [{fareCents:-1},{tipCents:-1},{fareCents:1.5},{tipCents:NaN}]){
  const db=fakeDb();
  await assert.rejects(saveBookingRequest(db,{...booking,...patch}),/Invalid amounts/);
  assert.equal(db.calls.length,0);
 }
});
test('does not expose fare to dispatch during inbox persistence',async()=>{
 const db=fakeDb();await saveBookingRequest(db,booking);
 assert.match(db.calls[0].sql,/booking_requests/);
 assert.equal(db.calls[0].values[10],6500);
 assert.equal(db.calls[0].values[11],975);
});

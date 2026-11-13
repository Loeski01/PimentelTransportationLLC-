'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {inboxRowToDispatch,getBookingForTransferSQL}=require('./inbox-row-to-dispatch');

const row={
 reference:'PT-ABC123',passenger_name:'Maria Castillo',
 pickup_address:'Logan Airport',destination_address:'Woburn, MA',
 pickup_local_date:'2026-11-14',pickup_local_time:'14:30:00',
 status:'received',passenger_email:'private@example.com',fare_cents:6500
};
test('stored booking becomes privacy-limited pending dispatch payload',()=>{
 const payload=inboxRowToDispatch(row,'America/New_York');
 assert.deepEqual(payload,{
  booking_reference:'PT-ABC123',passenger_surname:'Castillo',
  pickup_address:'Logan Airport',destination_address:'Woburn, MA',
  pickup_at:'2026-11-14T19:30:00.000Z'
 });
 assert.equal('passenger_email' in payload,false);
 assert.equal('fare_cents' in payload,false);
});
test('transferring status can be reconciled after uncertain response',()=>{
 assert.equal(inboxRowToDispatch({...row,status:'transferring'},'America/New_York').booking_reference,row.reference);
});
test('cancelled booking cannot transfer',()=>{
 assert.throws(()=>inboxRowToDispatch({...row,status:'cancelled'},'America/New_York'),/not eligible/);
});
test('already transferred booking cannot transfer again from inbox',()=>{
 assert.throws(()=>inboxRowToDispatch({...row,status:'transferred'},'America/New_York'),/not eligible/);
});
test('database dates must be cast to text, not JS Date objects',()=>{
 assert.match(getBookingForTransferSQL,/pickup_local_date::text/);
 assert.match(getBookingForTransferSQL,/pickup_local_time::text/);
 assert.throws(()=>inboxRowToDispatch({...row,pickup_local_date:new Date()},'America/New_York'),/Invalid booking row/);
});

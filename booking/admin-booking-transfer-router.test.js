'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {createAdminBookingTransferRouter}=require('./admin-booking-transfer-router');
const ref='PT-ABC123';
const booking={reference:ref,status:'transferring',passenger_name:'Maria Castillo',
 pickup_address:'Logan Airport',destination_address:'Woburn, MA',
 pickup_local_date:'2026-11-14',pickup_local_time:'14:30:00'};
function dbFactory(state='received'){
 let status=state,dispatchId=null;
 const calls=[];
 return {calls,query:async(sql,values)=>{
  calls.push(sql);
  if(sql.startsWith('UPDATE')&&sql.includes("status='received'")&&sql.includes('transfer_attempts')){
   if(status!=='received')return {rowCount:0,rows:[]};
   status='transferring';return {rowCount:1,rows:[{reference:ref,status}]};
  }
  if(sql.startsWith('SELECT reference,status,dispatch_trip_id'))
   return {rowCount:1,rows:[{reference:ref,status,dispatch_trip_id:dispatchId}]};
  if(sql.startsWith('SELECT reference, passenger_name'))
   return {rowCount:1,rows:[{...booking,status}]};
  if(sql.startsWith('UPDATE')&&sql.includes("status='transferred'")){
   if(status!=='transferring')return {rowCount:0,rows:[]};
   status='transferred';dispatchId=values[1];
   return {rowCount:1,rows:[{reference:ref,status,dispatch_trip_id:dispatchId}]};
  }
  throw new Error('Unexpected SQL query');
 }};
}
async function withServer({db,auth,send},callback) {
 const app=express();
 app.use(express.json());
 const requireAdmin=(req,res,next)=>auth?next():res.sendStatus(403);
 app.use('/admin/booking',createAdminBookingTransferRouter({
  db,requireAdmin,sendToDispatch:send,timeZone:'America/New_York'
 }));
 app.use((error,req,res,next)=>res.status(503).json({error:'Transfer requires reconciliation'}));
 const server=app.listen(0,'127.0.0.1');
 try{
  await new Promise(resolve=>server.once('listening',resolve));
  return await callback('http://127.0.0.1:'+server.address().port);
 }finally{await new Promise(resolve=>server.close(resolve));}
}
test('only administrator may transfer',async()=>{
 const db=dbFactory();
 await withServer({db,auth:false,send:()=>{throw Error('Not reached')}},async base=>{
  const res=await fetch(base+'/admin/booking/'+ref+'/send-to-dispatch',{method:'POST'});
  assert.equal(res.status,403);assert.equal(db.calls.length,0);
 });
});
test('successful transfer records pending dispatch trip and no PII sent',async()=>{
 const db=dbFactory();let transferredPayload;
 await withServer({db,auth:true,send:async payload=>{
  transferredPayload=payload;return {id:11,status:'pending',created:true};
 }},async base=>{
  const res=await fetch(base+'/admin/booking/'+ref+'/send-to-dispatch',{method:'POST'});
  assert.equal(res.status,201);
  assert.deepEqual(await res.json(),{reference:ref,status:'transferred',dispatch_trip_id:11});
  assert.deepEqual(Object.keys(transferredPayload).sort(),
   ['booking_reference','passenger_surname','pickup_address','destination_address','pickup_at'].sort());
 });
});
test('double click returns same trip without another dispatch request',async()=>{
 const db=dbFactory();let sends=0;
 await withServer({db,auth:true,send:async()=>{sends++;return {id:11,status:'pending',created:true}}},async base=>{
  const url=base+'/admin/booking/'+ref+'/send-to-dispatch';
  const one=await fetch(url,{method:'POST'});assert.equal(one.status,201);
  const two=await fetch(url,{method:'POST'});assert.equal(two.status,200);
  assert.equal((await two.json()).alreadyTransferred,true);
  assert.equal(sends,1);
 });
});
test('cancelled booking blocked before dispatch request',async()=>{
 const db=dbFactory('cancelled');let sends=0;
 await withServer({db,auth:true,send:async()=>{sends++;return {id:11,status:'pending'}}},async base=>{
  const res=await fetch(base+'/admin/booking/'+ref+'/send-to-dispatch',{method:'POST'});
  assert.equal(res.status,409);assert.equal(sends,0);
 });
});
test('network timeout does not reset transfer state for blind resend',async()=>{
 const db=dbFactory();let sends=0;
 await withServer({db,auth:true,send:async()=>{sends++;throw Error('timeout')}},async base=>{
  const url=base+'/admin/booking/'+ref+'/send-to-dispatch';
  const one=await fetch(url,{method:'POST'});assert.equal(one.status,503);
  const two=await fetch(url,{method:'POST'});assert.equal(two.status,409);
  assert.equal(sends,1);
 });
});

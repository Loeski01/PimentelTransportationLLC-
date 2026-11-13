'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {createBookingImportRouter}=require('./booking-import-router');
const {createServiceAuth}=require('./service-auth');
const secret='test-only-service-secret-0123456789abcdef';
const payload={booking_reference:'PT-TEST123',passenger_surname:'Prueba',pickup_address:'Logan Airport',destination_address:'Woburn',pickup_at:'2026-11-14T14:30:00-05:00'};
async function withApp(run){
 const calls=[];let created=false;
 const db={connect:async()=>({query:async(sql,params)=>{
  calls.push(sql);
  if(sql.startsWith('INSERT INTO dispatch_trips')){
   if(created)return {rowCount:0,rows:[]};
   created=true;return {rowCount:1,rows:[{id:41,status:'pending'}]};
  }
  if(sql.startsWith('SELECT id,status'))return {rowCount:1,rows:[{id:41,status:'pending'}]};
  return {rowCount:1,rows:[]};
 },release:()=>{}})};
 const app=express();app.use(express.json());
 app.use('/dispatch/booking',createBookingImportRouter({db,requireServiceAuth:createServiceAuth(secret)}));
 app.use((err,req,res,next)=>res.status(500).json({error:'Internal error'}));
 const server=app.listen(0,'127.0.0.1');
 try{
  await new Promise(resolve=>server.once('listening',resolve));
  await run('http://127.0.0.1:'+server.address().port,calls);
 }finally{await new Promise(resolve=>server.close(resolve));}
}
const post=(base,key,body=payload)=>fetch(base+'/dispatch/booking/import',{
 method:'POST',headers:{'Content-Type':'application/json',...(key?{'X-Booking-Service-Key':key}:{})},
 body:JSON.stringify(body)
});
test('fictitious import requires service authentication and never touches DB without it',async()=>{
 await withApp(async(base,calls)=>{
  assert.equal((await post(base,null)).status,401);
  assert.equal((await post(base,'wrong-secret')).status,401);
  assert.equal(calls.length,0);
 });
});
test('fictitious booking creates pending trip once; repeat returns same trip',async()=>{
 await withApp(async(base,calls)=>{
  const first=await post(base,secret);
  assert.equal(first.status,201);
  assert.deepEqual(await first.json(),{id:41,status:'pending',created:true});
  const second=await post(base,secret);
  assert.equal(second.status,200);
  assert.deepEqual(await second.json(),{id:41,status:'pending',created:false});
  assert.equal(calls.filter(sql=>sql.startsWith('INSERT INTO dispatch_audit')).length,1);
  assert.equal(calls.filter(sql=>sql==='COMMIT').length,2);
 });
});
test('invalid fictitious booking is rejected without a database write',async()=>{
 await withApp(async(base,calls)=>{
  const response=await post(base,secret,{...payload,booking_reference:'INVALID'});
  assert.equal(response.status,400);
  assert.equal(calls.length,0);
 });
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const express=require('express'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {router}=require('../booking-staging-router');
test('both inbox modes compile and use the server-selected API prefix',()=>{
 const template=fs.readFileSync(path.join(__dirname,'../booking-admin.html'),'utf8');
 for(const base of ['/booking','/booking-staging']){
  const html=template.replace('__BOOKING_API_BASE__',JSON.stringify(base));
  new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
  assert.ok(html.includes('const bookingBase='+JSON.stringify(base)));
  assert.ok(html.includes("fetch(bookingBase+'/inbox'"));
  assert.ok(html.includes("fetch(bookingBase+'/' +"));
 }
});
test('intake authenticates, persists exact reference, rejects failures and isolates admin inbox',async()=>{
 let calls=0,fail=false;
 const app=express();app.use(express.json());
 app.use('/booking',router({secret:'x'.repeat(40),db:{query:async()=>{calls++;if(fail)throw Error('database unavailable');return {rowCount:1,rows:[]}}},requireAdmin:(req,res)=>res.sendStatus(403)}));
 app.use((err,req,res,next)=>res.sendStatus(500));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const url='http://127.0.0.1:'+server.address().port;
 const body={reference:'PT-ABC1234',name:'Test Passenger',phone:'+16175550123',email:'test@example.com',from:'Boston',to:'Woburn',date:'2026-11-20',time:'14:30',tier:'luxury',payment:'later',fareCents:8000,tipCents:0};
 const post=key=>fetch(url+'/booking/intake',{method:'POST',headers:{'Content-Type':'application/json','X-Booking-Service-Key':key},body:JSON.stringify(body)});
 try{
  assert.equal((await post('wrong')).status,403);assert.equal(calls,0);
  assert.equal((await fetch(url+'/booking/inbox')).status,403);
  const response=await post('x'.repeat(40));assert.equal(response.status,201);
  assert.deepEqual(await response.json(),{stored:true,reference:body.reference});
  fail=true;assert.equal((await post('x'.repeat(40))).status,500);
 }finally{await new Promise(r=>server.close(r))}
});

test('driver view displays pickup date and time in Boston without displaying fare',()=>{
 const panel=fs.readFileSync(path.join(__dirname,'../private-panel.html'),'utf8');
 const driverView=panel.slice(panel.indexOf('async function loadDriver()'));
 assert.match(driverView,/t\.pickup_at/);
 assert.match(driverView,/timeZone:'America\/New_York'/);
 assert.match(driverView,/Pickup \/ Recogida:/);
 assert.doesNotMatch(driverView,/t\.fare_cents/);
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {router}=require('../booking-staging-router');
test('unpriced intake persists null and dispatch transfer waits for admin quote',async()=>{
 let saved,quoted=false;
 const db={query:async(sql,args)=>{if(sql.startsWith('INSERT')){saved=args;return {rowCount:1}}if(sql.startsWith('UPDATE')){quoted=true;return {rowCount:1}}return {rows:[]}},connect:async()=>({query:async sql=>sql.startsWith('SELECT')?{rowCount:1,rows:[{fare_cents:null,status:'received'}]}:{},release(){}})};
 const app=express();app.use(express.json());app.use('/booking',router({secret:'x'.repeat(40),db,requireAdmin:(req,res,next)=>next()}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url='http://127.0.0.1:'+server.address().port;
 const body={reference:'PT-UNPRICED1',name:'Test',phone:'+16175550123',email:'test@example.com',from:'Boston',to:'Woburn',date:'2026-11-20',time:'14:30',tier:'luxury',payment:'coordinate',fareCents:null,tipCents:0,quotePending:true};
 const post=(path,data)=>fetch(url+'/booking/'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Booking-Service-Key':'x'.repeat(40)},body:JSON.stringify(data)});
 try{
  assert.equal((await post('intake',body)).status,201);assert.equal(saved[10],null);
  assert.equal((await post('intake',{...body,quotePending:false})).status,400);
  assert.equal((await post(body.reference+'/send-to-dispatch',{})).status,409);
  assert.equal((await post(body.reference+'/quote',{fareCents:0})).status,400);assert.equal(quoted,false);
  assert.equal((await post(body.reference+'/quote',{fareCents:6500})).status,200);assert.equal(quoted,true);
 }finally{await new Promise(r=>server.close(r))}
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function route({mailFails=false,intakeFails=false}={}){
 const routes={};const app={use(){},get(){},post(path,fn){routes[path]=fn},listen(){}};const express=()=>app;express.json=()=>()=>{};
 let forwarded,mailCalls=0,mapCalls=0;
 const context=vm.createContext({console:{log(){},error(){}},process:{env:{BREVO_API_KEY:'test',BREVO_SENDER_EMAIL:'sender@example.com',BOOKING_DISPATCH_PRODUCTION_ENABLED:'true',BOOKING_SERVICE_SECRET:'x'.repeat(40),BOOKING_DISPATCH_URL:'https://dispatch.onrender.com/booking/intake'}},AbortSignal,AbortController,setTimeout,clearTimeout,Buffer,
  require(name){if(name==='express')return express;if(name==='stripe')return function(){};if(name==='node:crypto')return require(name);if(name==='node:timers/promises')return {setTimeout:async()=>{}};if(name==='./booking/production-dispatch-sender')return {createProductionDispatchSender:()=>async b=>{forwarded=b;if(intakeFails)throw Error('intake failed');return {stored:true,reference:b.reference}}};throw Error('Unexpected dependency '+name)},
  fetch:async url=>{
   if(String(url).includes('brevo.com')){mailCalls++;return {ok:!mailFails,status:503,json:async()=>({messageId:'test'})}}
   mapCalls++;return {ok:true,json:async()=>mapCalls<=2?[{lat:'42',lon:'-71',display_name:'Boston'}]:{code:'Ok',routes:[{distance:16093.44,duration:1200}]}};
  }
 });
 vm.runInContext(fs.readFileSync('server.js','utf8'),context);
 return {async call(){let status=200,data;const res={setHeader(){},status(n){status=n;return this},json(d){data=d}};await routes['/api/booking-request']({ip:'test',body:{name:'Test Passenger',email:'test@example.com',phone:'+16175550123',from:'Boston',to:'Woburn',date:'2026-11-20',time:'14:30',passengers:'1',details:'TEST',payment:'later',tier:'luxury',tipPercent:0,tipCents:0,expectedFareCents:8000}},res);return {status,data}},get forwarded(){return forwarded},get mailCalls(){return mailCalls}};
}
test('public booking forwards server-calculated amount and exact reference before notices',async()=>{const h=route();const r=await h.call();assert.equal(r.status,200);assert.equal(r.data.reference,h.forwarded.reference);assert.equal(h.forwarded.fareCents,8000);assert.equal(r.data.received,true);assert.equal(h.mailCalls,2)});
test('a stored booking remains received when email provider fails',async()=>{const h=route({mailFails:true});const r=await h.call();assert.equal(r.status,200);assert.equal(r.data.received,true);assert.equal(r.data.adminNoticeSent,false);assert.equal(r.data.customerNoticeSent,false)});
test('failed intake does not send misleading received notices',async()=>{const h=route({intakeFails:true});const r=await h.call();assert.equal(r.status,502);assert.equal(h.mailCalls,0)});

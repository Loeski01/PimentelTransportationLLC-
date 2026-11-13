'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createProductionDispatchSender}=require('./production-dispatch-sender');
const secret='x'.repeat(40);
test('disabled unless explicitly enabled',()=>assert.throws(()=>createProductionDispatchSender({endpoint:'https://dispatch.onrender.com/booking/intake',secret}),/disabled/));
test('rejects staging and non-HTTPS destinations',()=>{
 for(const endpoint of ['https://dispatch-staging.onrender.com/booking/intake','http://dispatch.onrender.com/booking/intake','https://dispatch.onrender.com/booking-staging/intake','https://example.com/booking/intake'])
 assert.throws(()=>createProductionDispatchSender({endpoint,secret,enabled:true}),/production intake/);
});
test('rejects short authentication secrets',()=>assert.throws(()=>createProductionDispatchSender({endpoint:'https://dispatch.onrender.com/booking/intake',secret:'short',enabled:true}),/secret/));
test('forwards only valid booking reference to dedicated intake',async()=>{
 let called=false;
 const send=createProductionDispatchSender({endpoint:'https://dispatch.onrender.com/booking/intake',secret,enabled:true,fetchImpl:async(url,options)=>{
 called=true;assert.equal(url,'https://dispatch.onrender.com/booking/intake');assert.equal(options.headers['X-Booking-Service-Key'],secret);
 return {ok:true,json:async()=>({received:true})};
 }});
 await assert.rejects(send({reference:'bad'}),/reference/);
 assert.equal(called,false);
 assert.deepEqual(await send({reference:'PT-ABC1234'}),{received:true});
 assert.equal(called,true);
});

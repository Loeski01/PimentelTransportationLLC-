'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createProductionDispatchSender}=require('./production-dispatch-sender');
const secret='s'.repeat(40),endpoint='https://pimentel-dispatch.onrender.com/booking/intake';
const booking={reference:'PT-TEST1234',fareCents:28500,hours:3,tier:'luxury'};
const sender=fetchImpl=>createProductionDispatchSender({enabled:true,endpoint,secret,fetchImpl});
test('dispatch success requires durable storage and matching reference',async()=>{
 let calls=0;
 const forward=sender(async(url,opts)=>{calls++;assert.equal(url,endpoint);assert.equal(opts.method,'POST');assert.equal(JSON.parse(opts.body).fareCents,28500);return {ok:true,json:async()=>({stored:true,reference:booking.reference})};});
 assert.deepEqual(await forward(booking),{stored:true,reference:booking.reference});assert.equal(calls,1);
});
test('dispatch rejects unverified persistence or mismatched reference',async()=>{
 for(const response of [{ok:true,json:async()=>({stored:false,reference:booking.reference})},{ok:true,json:async()=>({stored:true,reference:'PT-OTHER'})},{ok:false,status:503}])
  await assert.rejects(sender(async()=>response)(booking));
});
test('dispatch blocks missing secret and nonproduction endpoint',()=>{
 assert.throws(()=>createProductionDispatchSender({enabled:true,endpoint,secret:'short'}));
 assert.throws(()=>createProductionDispatchSender({enabled:true,endpoint:'http://localhost/booking/intake',secret}));
});

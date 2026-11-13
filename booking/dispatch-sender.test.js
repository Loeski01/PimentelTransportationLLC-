'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createDispatchSender}=require('./dispatch-sender');
const opts={baseUrl:'https://pimentel-dispatch-oregon-staging.onrender.com/',
 secret:'staging-secret-at-least-32-characters-long'};
const payload={booking_reference:'PT-ABC123',passenger_surname:'Castillo',
 pickup_address:'Logan Airport',destination_address:'Woburn, MA',pickup_at:'2026-11-14T19:30:00.000Z'};
test('sends only one authenticated HTTPS request to staging endpoint',async()=>{
 let calls=0;
 const send=createDispatchSender({...opts,fetchImpl:async(url,init)=>{
  calls++;
  assert.equal(url,'https://pimentel-dispatch-oregon-staging.onrender.com/dispatch/booking/import');
  assert.equal(init.method,'POST');
  assert.equal(init.headers['X-Booking-Service-Key'],opts.secret);
  assert.equal(init.redirect,'error');
  assert.deepEqual(JSON.parse(init.body),payload);
  return {ok:true,json:async()=>({id:11,status:'pending',created:true})};
 }});
 assert.deepEqual(await send(payload),{id:11,status:'pending',created:true});
 assert.equal(calls,1);
});
test('rejects HTTP insecure URL and unexpected host',()=>{
 assert.throws(()=>createDispatchSender({...opts,baseUrl:'http://pimentel-dispatch-oregon-staging.onrender.com/'}),/HTTPS/);
 assert.throws(()=>createDispatchSender({...opts,baseUrl:'https://example.com/'}),/HTTPS/);
});
test('rejects weak secret',()=>assert.throws(()=>createDispatchSender({...opts,secret:'weak'}),/secret/));
test('HTTP error does not automatically retry',async()=>{
 let count=0;
 const send=createDispatchSender({...opts,fetchImpl:async()=>{count++;return {ok:false,status:502}}});
 await assert.rejects(send(payload),/reconcile/);
 assert.equal(count,1);
});
test('invalid JSON result does not mark transfer complete',async()=>{
 const send=createDispatchSender({...opts,fetchImpl:async()=>({ok:true,json:async()=>({id:'11',status:'pending'})})});
 await assert.rejects(send(payload),/reconcile/);
});
test('invalid booking reference rejected before fetch',async()=>{
 let count=0;
 const send=createDispatchSender({...opts,fetchImpl:async()=>{count++;throw Error('Unexpected call')}});
 await assert.rejects(send({...payload,booking_reference:'invalid'}),/Valid booking/);
 assert.equal(count,0);
});

test('rejects embedded credentials, URL parameters and non-root paths',()=>{
 for(const baseUrl of [
  'https://user:pass@pimentel-dispatch-oregon-staging.onrender.com/',
  'https://pimentel-dispatch-oregon-staging.onrender.com/?token=secret',
  'https://pimentel-dispatch-oregon-staging.onrender.com/other',
  'https://pimentel-dispatch-oregon-staging.onrender.com/#fragment'
 ])assert.throws(()=>createDispatchSender({...opts,baseUrl}),/HTTPS/);
});
test('network timeout or transport failure does not retry automatically',async()=>{
 let calls=0;
 const send=createDispatchSender({...opts,fetchImpl:async()=>{calls++;throw new Error('network timeout')}});
 await assert.rejects(send(payload),/network timeout/);
 assert.equal(calls,1);
});
test('invalid transport configuration rejected before sending',()=>{
 assert.throws(()=>createDispatchSender({...opts,timeoutMs:0}),/transport/);
 assert.throws(()=>createDispatchSender({...opts,timeoutMs:30001}),/transport/);
});

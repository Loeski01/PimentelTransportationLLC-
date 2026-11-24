'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeUsPhone,createArrivalSmsSender}=require('../arrival-sms');
test('normalizes US phone numbers and rejects invalid ones',()=>{
  assert.equal(normalizeUsPhone('(617) 555-0100'),'+16175550100');
  assert.equal(normalizeUsPhone('+1 617 555 0100'),'+16175550100');
  assert.equal(normalizeUsPhone('123'),null);
});
test('arrival SMS uses Brevo transport only when invoked',async()=>{
  const calls=[];
  const send=createArrivalSmsSender({apiKey:'test-key',fetchImpl:async(url,options)=>{
    calls.push({url,options});return {ok:true,json:async()=>({messageId:42})};
  }});
  assert.equal(calls.length,0);
  const result=await send({phone:'6175550100',pickupAddress:'Boston Logan'});
  assert.equal(result.messageId,42);
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,'https://api.brevo.com/v3/transactionalSMS/sms');
  assert.equal(JSON.parse(calls[0].options.body).recipient,'+16175550100');
});
test('invalid numbers do not call Brevo',async()=>{
  let called=false;
  const send=createArrivalSmsSender({apiKey:'test-key',fetchImpl:async()=>{called=true;}});
  await assert.rejects(send({phone:'bad'}),/Invalid passenger phone/);
  assert.equal(called,false);
});

test('Brevo failure is reported without a false success',async()=>{
  const send=createArrivalSmsSender({apiKey:'test-key',fetchImpl:async()=>({ok:false,status:401,json:async()=>({})})});
  await assert.rejects(send({phone:'6175550100'}),/HTTP 401/);
});
test('Brevo timeout or network failure propagates',async()=>{
  const send=createArrivalSmsSender({apiKey:'test-key',fetchImpl:async()=>{throw new Error('timeout')}});
  await assert.rejects(send({phone:'6175550100'}),/timeout/);
});
test('missing API key never contacts provider',async()=>{
  let called=false;
  const send=createArrivalSmsSender({fetchImpl:async()=>{called=true;}});
  await assert.rejects(send({phone:'6175550100'}),/API key not configured/);
  assert.equal(called,false);
});

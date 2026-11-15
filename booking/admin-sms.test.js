'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createAdminSms}=require('./admin-sms');
const reference='PT-TEST2026';
test('disabled or incomplete configuration makes no network calls',async()=>{
 const fetchImpl=()=>{throw Error('Unexpected network call')};
 assert.equal((await createAdminSms({fetchImpl})(reference)).status,'disabled');
 assert.equal((await createAdminSms({enabled:true,fetchImpl})(reference)).status,'configuration_missing');
});
test('SMS is addressed only to administrator with a short reference-only notice',async()=>{
 let calls=0;
 const notify=createAdminSms({enabled:true,apiKey:'fake',sender:'Pimentel',fetchImpl:async(url,options)=>{
  calls++;assert.equal(url,'https://api.brevo.com/v3/transactionalSMS/send');
  const p=JSON.parse(options.body);assert.equal(p.recipient,'16177855657');
  assert.equal(p.type,'transactional');assert.ok(p.content.length<=160);
  assert.match(p.content,/PT-TEST2026/);assert.equal(options.headers['api-key'],'fake');
  return {ok:true,json:async()=>({messageId:12345})};
 }});
 assert.equal((await notify(reference)).status,'submitted');assert.equal(calls,1);
});
test('rejections and uncertain responses are not retried or reported delivered',async()=>{
 for(const [response,status] of [[{ok:false,status:400},'rejected'],[{ok:false,status:500},'unknown'],[{ok:true,json:async()=>({})},'unknown'],[null,'unknown']]){
  let calls=0;const notify=createAdminSms({enabled:true,apiKey:'fake',sender:'Pimentel',fetchImpl:async()=>{calls++;if(!response)throw Error('timeout');return response}});
  assert.equal((await notify(reference)).status,status);assert.equal(calls,1);
 }
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createAdminSmsSender}=require('./admin-sms');
const config={enabled:true,apiKey:'test',sender:'Pimentel'};
const booking={reference:'PT-TEST2026',date:'2026-11-20',time:'14:30'};
test('SMS stays disabled until explicitly activated',()=>assert.equal(createAdminSmsSender({}),null));
test('requires registered sender and fixes destination to owner WhatsApp/SMS phone',()=>{assert.throws(()=>createAdminSmsSender({...config,sender:''}),/sender/);assert.throws(()=>createAdminSmsSender({...config,recipient:'16175188281'}),/destination/)});
test('sends only a short transactional notice to 617-785-5657',async()=>{let body,calls=0;const send=createAdminSmsSender({...config,fetchImpl:async(url,options)=>{calls++;body=JSON.parse(options.body);return {ok:true,json:async()=>({messageId:1234})}}});assert.equal((await send(booking)).accepted,true);assert.equal(calls,1);assert.equal(body.recipient,'16177855657');assert.equal(body.type,'transactional');assert.ok(body.content.length<=160);assert.equal(body.unicodeEnabled,false);assert.match(body.content,/PT-TEST2026/)});
test('provider rejection or uncertain response never causes an automatic retry',async()=>{for(const response of [{ok:false},{ok:true,json:async()=>({})}]){let calls=0;const send=createAdminSmsSender({...config,fetchImpl:async()=>{calls++;return response}});await assert.rejects(send(booking));assert.equal(calls,1)}});

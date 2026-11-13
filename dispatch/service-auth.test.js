'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createServiceAuth}=require('./service-auth');
const secret='staging-dedicated-secret-32-bytes-minimum-123';
function invoke(middleware,value) {
 let status=null,body=null,passed=false;
 const req={get:(name)=>name==='X-Booking-Service-Key'?value:undefined};
 const res={status(n){status=n;return this},json(v){body=v;return this}};
 middleware(req,res,()=>{passed=true});
 return {status,body,passed};
}
test('rejects missing key',()=>assert.equal(invoke(createServiceAuth(secret),undefined).status,401));
test('rejects incorrect key',()=>assert.equal(invoke(createServiceAuth(secret),'bad').status,401));
test('accepts correct dedicated key',()=>assert.equal(invoke(createServiceAuth(secret),secret).passed,true));
test('rejects weak configuration',()=>assert.throws(()=>createServiceAuth('short'),/32 bytes/));

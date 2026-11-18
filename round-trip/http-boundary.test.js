'use strict';
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const net=require('node:net');
const path=require('node:path');
async function freePort(){const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));return port}
async function run(){
 const port=await freePort();
 const child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),NODE_ENV:'production',ROUND_TRIP_TEST_INTAKE_PORT:'39999',STRIPE_SECRET_KEY:'',BOOKING_DISPATCH_PRODUCTION_ENABLED:'false',BOOKING_DISPATCH_URL:'',BOOKING_SERVICE_SECRET:'',BREVO_API_KEY:'',BREVO_SENDER_EMAIL:''},stdio:['ignore','pipe','pipe']});
 let stderr='';child.stderr.on('data',d=>stderr+=d);
 try{
  const base='http://127.0.0.1:'+port;
  let ready=false;
  for(let i=0;i<70;i++){if(child.exitCode!==null)break;try{const r=await fetch(base+'/');if(r.ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,100))}
  assert.ok(ready,'Server did not start: '+stderr);
  const pre=await fetch(base+'/api/integration-preflight');
  assert.equal(pre.status,200);
  const preflight=await pre.json();
  assert.equal(preflight.forwardingEnabled,false);
  assert.equal(preflight.configurationReady,false);
  const payload={tripType:'round_trip',from:'Boston',to:'Cambridge',date:'2026-12-01',time:'10:00',returnDate:'2026-12-02',returnTime:'10:00'};
  const internal=await fetch(base+'/api/test/round-trip-request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  assert.equal(internal.status,404,'test intake must never be mounted in production');
  for(const route of ['/api/booking-request','/api/create-checkout-session']){
   const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   assert.equal(r.status,409,route+' should reject round trips');
   assert.equal((await r.json()).code,'ROUND_TRIP_NOT_ENABLED');
  }
  const invalid=await fetch(base+'/api/round-trip-quote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,returnDate:'2026-11-30'})});
  assert.equal(invalid.status,400);
  assert.equal((await invalid.json()).code,'INVALID_ROUND_TRIP');
  // Untrusted callers cannot bypass the disabled round-trip booking/payment gate.
  const variants=[
   {...payload,customerName:'Test Customer',customerEmail:'test@example.test',paymentMethod:'later'},
   {...payload,status:'approved',fare:0,discount:100,driverId:1},
   {...payload,tripType:'round_trip',returnDate:'2026-12-03',returnTime:'14:00'}
  ];
  for(const variant of variants){
   for(const route of ['/api/booking-request','/api/create-checkout-session']){
    const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(variant)});
    assert.equal(response.status,409,route+' must reject disabled round-trip booking regardless of extra fields');
    assert.equal((await response.json()).code,'ROUND_TRIP_NOT_ENABLED');
   }
  }
  console.log('HTTP integration boundary checks passed: no real payments, dispatch, geocoding, or emails');
 }finally{child.kill('SIGTERM')}
}
run().catch(e=>{console.error(e);process.exitCode=1});

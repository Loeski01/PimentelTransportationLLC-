const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

test('private driver panel inline scripts parse as JavaScript',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','private-panel.html'),'utf8');
 const scripts=[...html.matchAll(/<script\b[^>]*>([^]*?)<\/script>/gi)].map(m=>m[1]).filter(Boolean);
 assert.ok(scripts.length>0,'expected at least one inline script');
 for(const script of scripts) assert.doesNotThrow(()=>new vm.Script(script,{filename:'private-panel.html'}));
});

test('driver panel does not display fare or payment fields',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','private-panel.html'),'utf8');
 assert.doesNotMatch(html,/fare_cents|payment_intent|card_number/i);
});

test('dispatch driver API excludes fare and payment columns',()=>{
 const router=fs.readFileSync(path.join(__dirname,'..','router.js'),'utf8');
 const start=router.indexOf("router.get('/driver/trips'");
 const end=router.indexOf("router.post('/driver/trips/:id/arrive'",start);
 assert.ok(start>=0&&end>start,'driver trips endpoint must exist');
 const endpoint=router.slice(start,end);
 assert.match(endpoint,/SELECT id,passenger_surname,pickup_address,destination_address,pickup_at,arrived_at,status FROM dispatch_trips/);
 assert.doesNotMatch(endpoint,/fare_cents|payment_intent|SELECT \*/i);
});

test('driver trip query remains restricted to logged-in driver',()=>{
 const router=fs.readFileSync(path.join(__dirname,'..','router.js'),'utf8');
 const start=router.indexOf("router.get('/driver/trips'");
 const end=router.indexOf("router.post('/driver/trips/:id/arrive'",start);
 const endpoint=router.slice(start,end);
 assert.match(endpoint,/requireDriver/);
 assert.match(endpoint,/WHERE driver_id=\$1/);
 assert.match(endpoint,/\[req\.driver\.id\]/);
});

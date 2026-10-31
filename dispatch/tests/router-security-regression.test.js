const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const {createDispatchRouter} = require('../router');

async function request(db, role, method, path, body) {
  const app = express();
  app.use(express.json());
  app.use('/dispatch', createDispatchRouter({
    db,
    requireAdmin: (req,res,next) => role === 'admin' ? next() : res.sendStatus(403),
    requireDriver: (req,res,next) => {
      if (role !== 'driver') return res.sendStatus(403);
      req.driver={id:7};next();
    }
  }));
  const server=app.listen(0,'127.0.0.1');
  try {
    await new Promise(resolve=>server.once('listening',resolve));
    const url='http://127.0.0.1:'+server.address().port+'/dispatch'+path;
    const response=await fetch(url,{method,headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,body:await response.text()};
  } finally {await new Promise(resolve=>server.close(resolve))}
}

test('driver cannot access admin enrollment or admin trip list',async()=>{
  const db={query:async()=>{throw Error('must not query')}};
  assert.equal((await request(db,'driver','POST','/admin/drivers',{displayName:'Test',pin:'1234'})).status,403);
  assert.equal((await request(db,'driver','GET','/admin/trips')).status,403);
});

test('invalid driver PIN rejected without DB writes',async()=>{
  const db={query:async()=>{throw Error('must not query')}};
  const r=await request(db,'admin','POST','/admin/drivers',{displayName:'Test',pin:'12345'});
  assert.equal(r.status,400);
});

test('driver trip query scoped to authenticated driver and excludes fare',async()=>{
  let sql,params;
  const db={query:async(s,p)=>{sql=s;params=p;return {rows:[{id:4,passenger_surname:'Smith',status:'assigned'}]}}};
  const r=await request(db,'driver','GET','/driver/trips');
  assert.equal(r.status,200);
  assert.deepEqual(params,[7]);
  assert.match(sql,/WHERE driver_id=\$1/);
  assert.doesNotMatch(sql,/fare_cents|payment/i);
  assert.equal(JSON.parse(r.body)[0].passenger_surname,'Smith');
});

test('driver no-show requires explicit pickup confirmation',async()=>{
  const db={connect:async()=>{throw Error('must not connect')}};
  const r=await request(db,'driver','POST','/driver/trips/4/status',{status:'no_show'});
  assert.equal(r.status,400);
});

test('driver cannot assign trips',async()=>{
  const db={connect:async()=>{throw Error('must not connect')}};
  const r=await request(db,'driver','POST','/admin/trips/4/assign',{driverId:7});
  assert.equal(r.status,403);
});

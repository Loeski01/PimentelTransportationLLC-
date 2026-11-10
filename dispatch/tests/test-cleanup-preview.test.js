const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {createDispatchRouter}=require('../router');

async function startServer({authorized=true}={}){
 const queries=[];
 const rows={
  'SELECT id,display_name,active FROM dispatch_drivers ORDER BY id':[{id:'1',display_name:'Conductor prueba',active:true}],
  'SELECT id,driver_id,status FROM dispatch_trips ORDER BY id':[{id:'2',driver_id:'1',status:'started'}],
  'SELECT trip_id,driver_id FROM dispatch_admin_notifications':[{trip_id:'2',driver_id:'1'}],
  'SELECT trip_id FROM dispatch_trip_audit':[{trip_id:'2'}]
 };
 const db={query:async sql=>{queries.push(sql);if(!(sql in rows))throw Error('Unexpected SQL');return {rows:rows[sql],rowCount:rows[sql].length}}};
 const app=express();
 const requireAdmin=(req,res,next)=>authorized?next():res.sendStatus(403);
 app.use('/dispatch',createDispatchRouter({db,requireAdmin,requireDriver:(req,res,next)=>next()}));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});
 return {server,queries,url:'http://127.0.0.1:'+server.address().port+'/dispatch/admin/test-cleanup-preview'};
}

test('cleanup preview is admin-only and does not query data without authorization',async()=>{
 const ctx=await startServer({authorized:false});
 try{const r=await fetch(ctx.url);assert.equal(r.status,403);assert.deepEqual(ctx.queries,[])}
 finally{await new Promise(resolve=>ctx.server.close(resolve))}
});

test('cleanup preview returns counts and IDs without secrets and never mutates records',async()=>{
 const ctx=await startServer();
 try{
  const r=await fetch(ctx.url);
  assert.equal(r.status,200);
  assert.match(r.headers.get('cache-control'),/no-store/);
  const body=await r.json();
  assert.equal(body.mode,'read_only');
  assert.equal(body.backupVerified,false);
  assert.equal(body.deletionEnabled,false);
  assert.deepEqual(body.counts,{drivers:1,trips:1,notifications:1,audit:1});
  assert.deepEqual(body.trips,[{id:'2',driverId:'1',status:'started'}]);
  assert.ok(!JSON.stringify(body).includes('pin_hash'));
  assert.ok(!JSON.stringify(body).includes('passenger_phone'));
  assert.equal(ctx.queries.length,4);
  assert.ok(ctx.queries.every(q=>/^SELECT /i.test(q)));
 }finally{await new Promise(resolve=>ctx.server.close(resolve))}
});

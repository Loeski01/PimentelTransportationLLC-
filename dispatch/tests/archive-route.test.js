const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {createDispatchRouter}=require('../router');

async function setup({authorized=true}={}){
 const trips=[
  {id:1,status:'completed',archived_at:null},
  {id:2,status:'started',archived_at:null},
  {id:3,status:'pending',archived_at:null},
  {id:4,status:'completed',archived_at:new Date('2026-01-01')}
 ];
 const db={query:async(sql)=>{
  if(sql.includes('UPDATE dispatch_trips SET archived_at=NOW()')){
   const changed=trips.filter(t=>t.status==='completed'&&!t.archived_at);
   changed.forEach(t=>t.archived_at=new Date());
   return {rows:changed.map(t=>({id:t.id})),rowCount:changed.length};
  }
  if(sql.includes('WHERE archived_at IS NOT NULL ORDER BY archived_at DESC')){
   const rows=trips.filter(t=>t.archived_at).map(t=>({...t}));
   return {rows,rowCount:rows.length};
  }
  throw Error('Unexpected query: '+sql);
 }};
 const app=express();app.use(express.json());
 const requireAdmin=(req,res,next)=>authorized?next():res.sendStatus(403);
 app.use('/dispatch',createDispatchRouter({db,requireAdmin,requireDriver:(req,res,next)=>next()}));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});
 return {trips,server,base:'http://127.0.0.1:'+server.address().port+'/dispatch/admin/trips'};
}
async function close(s){await new Promise(resolve=>s.close(resolve))}
test('archive requires admin authorization and does not change records for non-admin',async()=>{
 const c=await setup({authorized:false});
 try{
  const r=await fetch(c.base+'/archive-completed',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({confirm:true})});
  assert.equal(r.status,403);assert.equal(c.trips.filter(t=>t.archived_at).length,1);
 }finally{await close(c.server)}
});
test('archive requires explicit confirmation',async()=>{
 const c=await setup();
 try{
  const r=await fetch(c.base+'/archive-completed',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({confirm:false})});
  assert.equal(r.status,400);assert.equal(c.trips.filter(t=>t.archived_at).length,1);
 }finally{await close(c.server)}
});
test('archive only completed, keeps active and pending, preserves archived history and is idempotent',async()=>{
 const c=await setup();
 try{
  const post=()=>fetch(c.base+'/archive-completed',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({confirm:true})});
  const first=await post();assert.equal(first.status,200);
  assert.deepEqual((await first.json()).tripIds,[1]);
  assert.equal(c.trips.find(t=>t.id===2).archived_at,null);
  assert.equal(c.trips.find(t=>t.id===3).archived_at,null);
  const history=await fetch(c.base+'/archived');
  assert.equal(history.status,200);
  assert.deepEqual((await history.json()).map(t=>t.id).sort(),[1,4]);
  const second=await post();assert.equal((await second.json()).archivedCount,0);
 }finally{await close(c.server)}
});

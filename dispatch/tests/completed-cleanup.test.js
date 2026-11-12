'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createDispatchRouter}=require('../router');
function setup(){
 const queries=[];
 const db={
  query:async(sql)=>{queries.push(sql);return {rowCount:2,rows:[{id:'3'},{id:'7'}]}},
  connect:async()=>{throw Error('Unexpected DB transaction')}
 };
 const router=createDispatchRouter({db,requireAdmin:(req,res,next)=>next(),requireDriver:(req,res,next)=>next()});
 const route=(path,method)=>router.stack.find(x=>x.route?.path===path&&x.route.methods[method]).route.stack.at(-1).handle;
 return {queries,route};
}
function response(){
 const r={statusCode:200,headers:{},body:null};
 r.status=function(n){this.statusCode=n;return this};
 r.set=function(k,v){this.headers[k]=v;return this};
 r.json=function(x){this.body=x;return this};
 return r;
}
test('completed trip deletion is disabled by default without touching DB',async()=>{
 const old=process.env.DISPATCH_COMPLETED_DELETE_ENABLED;
 delete process.env.DISPATCH_COMPLETED_DELETE_ENABLED;
 try{
  const {route,queries}=setup(),res=response();
  await route('/admin/trips/completed-cleanup','post')({body:{ids:['3','7']}},res,e=>{throw e});
  assert.equal(res.statusCode,403);
  assert.equal(queries.length,0);
 }finally{
  if(old===undefined)delete process.env.DISPATCH_COMPLETED_DELETE_ENABLED;
  else process.env.DISPATCH_COMPLETED_DELETE_ENABLED=old;
 }
});
test('completed-trip preview returns count and exact ids without deleting',async()=>{
 const old=process.env.DISPATCH_COMPLETED_DELETE_ENABLED;
 delete process.env.DISPATCH_COMPLETED_DELETE_ENABLED;
 try{
  const {route,queries}=setup(),res=response();
  await route('/admin/trips/completed-cleanup-preview','get')({},res,e=>{throw e});
  assert.deepEqual(res.body,{count:2,ids:['3','7'],enabled:false});
  assert.equal(queries.length,1);
  assert.match(queries[0],/status='completed'/);
 }finally{
  if(old===undefined)delete process.env.DISPATCH_COMPLETED_DELETE_ENABLED;
  else process.env.DISPATCH_COMPLETED_DELETE_ENABLED=old;
 }
});

test('completed trip cleanup rolls back if preview IDs no longer match',async()=>{
 const old=process.env.DISPATCH_COMPLETED_DELETE_ENABLED;
 process.env.DISPATCH_COMPLETED_DELETE_ENABLED='yes';
 const statements=[];
 const client={
  query:async(sql)=>{
   statements.push(sql);
   if(sql.includes("SELECT id FROM dispatch_trips WHERE status='completed'"))return {rows:[{id:'3'},{id:'8'}],rowCount:2};
   return {rows:[],rowCount:0};
  },
  release:()=>{}
 };
 const db={connect:async()=>client,query:async()=>{throw Error('Unexpected standalone query')}};
 const router=createDispatchRouter({db,requireAdmin:(req,res,next)=>next(),requireDriver:(req,res,next)=>next()});
 const route=router.stack.find(x=>x.route?.path==='/admin/trips/completed-cleanup').route.stack.at(-1).handle;
 try{
  const res=response();
  await route({body:{ids:['3','7']}},res,e=>{throw e});
  assert.equal(res.statusCode,409);
  assert.ok(statements.includes('ROLLBACK'));
  assert.ok(!statements.some(sql=>sql.startsWith('DELETE')));
 }finally{
  if(old===undefined)delete process.env.DISPATCH_COMPLETED_DELETE_ENABLED;
  else process.env.DISPATCH_COMPLETED_DELETE_ENABLED=old;
 }
});

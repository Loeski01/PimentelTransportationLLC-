"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const express=require("express");
const {PGlite}=require("@electric-sql/pglite");
test("PostgreSQL workflow and isolation between drivers",async()=>{
 const db=new PGlite();
 const dispatch=require("./router");
 const originalQuery=dispatch.pool.query,originalConnect=dispatch.pool.connect;
 const query=async(sql,args)=>{
  const r=await db.query(sql,args);
  return {...r,rowCount:r.affectedRows || r.rows.length};
 };
 dispatch.pool.query=query;
 dispatch.pool.connect=async()=>({query,release(){}});
 const app=express();app.use(express.json());
 // Admin actor is injected only by this test harness, never by public input in the app.
 app.use((req,res,next)=>{if(req.get("x-test-admin")==="yes")req.actor={role:"admin",id:"admin"};next();});
 app.use(require("./login"));app.use(dispatch.router);
 const server=app.listen(0,"127.0.0.1");
 await new Promise(resolve=>server.once("listening",resolve));
 const base="http://127.0.0.1:"+server.address().port;
 async function request(path,method="GET",body,headers={}){
  const r=await fetch(base+path,{method,headers:{"Content-Type":"application/json",...headers},body:body?JSON.stringify(body):undefined});
  return {status:r.status,body:await r.json()};
 }
 const admin={"x-test-admin":"yes"};
 try{
  await db.exec(fs.readFileSync(__dirname+"/schema.sql","utf8"));
  const drivers=[];
  for(let i=0;i<2;i++){
   const email="driver"+i+"@example.com",password="test-password-123";
   let r=await request("/drivers","POST",{name:"Test "+i,email,phone:"5550000000",vehicle:"Test SUV",password},admin);
   assert.equal(r.status,201);assert.equal(r.body.password_hash,undefined);
   const id=r.body.id;
   r=await request("/login","POST",{email,password});assert.equal(r.status,200);
   drivers.push({id,headers:{Authorization:"Bearer "+r.body.token}});
  }
  assert.equal((await request("/bookings")).status,401);
  assert.equal((await request("/drivers","GET",undefined,drivers[0].headers)).status,403);
  let r=await request("/bookings","POST",{customerName:"Fictitious Customer",customerEmail:"customer@example.com",customerPhone:"5550000000",pickup:"Test pickup",destination:"Test destination",pickupAt:"2026-11-01T12:00:00Z",estimatedFareCents:10000},admin);
  assert.equal(r.status,201);const booking=r.body.id;
  assert.equal((await request("/bookings/"+booking+"/assign","POST",{driverId:drivers[0].id},admin)).status,409);
  assert.equal((await request("/bookings/"+booking+"/approve","POST",{},admin)).status,200);
  r=await request("/bookings/"+booking+"/assign","POST",{driverId:drivers[0].id},admin);assert.equal(r.status,201);let assignment=r.body.id;
  assert.equal((await request("/bookings/"+booking+"/assign","POST",{driverId:drivers[1].id},admin)).status,409);
  assert.deepEqual((await request("/my-assignments","GET",undefined,drivers[1].headers)).body,[]);
  assert.equal((await request("/my-assignments/"+assignment+"/respond","POST",{status:"accepted"},drivers[1].headers)).status,409);
  assert.equal((await request("/my-assignments/"+assignment+"/respond","POST",{status:"rejected"},drivers[0].headers)).status,200);
  r=await request("/bookings/"+booking+"/assign","POST",{driverId:drivers[1].id},admin);assert.equal(r.status,201);assignment=r.body.id;
  assert.equal((await request("/my-assignments/"+assignment+"/start","POST",{},drivers[1].headers)).status,409);
  assert.equal((await request("/my-assignments/"+assignment+"/respond","POST",{status:"accepted"},drivers[1].headers)).status,200);
  assert.equal((await request("/my-assignments/"+assignment+"/complete","POST",{},drivers[1].headers)).status,409);
  assert.equal((await request("/my-assignments/"+assignment+"/start","POST",{},drivers[1].headers)).status,200);
  assert.equal((await request("/my-assignments/"+assignment+"/complete","POST",{},drivers[1].headers)).status,200);
  assert.equal((await request("/my-assignments/"+assignment+"/complete","POST",{},drivers[1].headers)).status,409);
  const rows=(await db.query("SELECT status FROM bookings WHERE id=$1",[booking])).rows;assert.equal(rows[0].status,"completed");
  const audit=(await db.query("SELECT action FROM dispatch_audit ORDER BY id")).rows.map(r=>r.action);
  assert.deepEqual(audit,["created","approved","assigned","rejected","assigned","accepted","started","completed"]);
  assert.equal((await request("/drivers/"+drivers[1].id,"PATCH",{active:false},admin)).status,200);
  assert.equal((await request("/my-assignments","GET",undefined,drivers[1].headers)).status,401);
 }finally{
  await new Promise(resolve=>server.close(resolve));
  dispatch.pool.query=originalQuery;dispatch.pool.connect=originalConnect;
  await dispatch.pool.end();await db.close();
 }
});

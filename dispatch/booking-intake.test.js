"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const crypto=require("node:crypto");
const express=require("express");
const {PGlite}=require("@electric-sql/pglite");
const {bostonDateTime,ensureIntakeSchema,createIntakeHandler}=require("./booking-intake");
test("Boston pickup times handle winter, summer and daylight-saving gaps",()=>{
 assert.equal(bostonDateTime("2026-11-02","12:30").toISOString(),"2026-11-02T17:30:00.000Z");
 assert.equal(bostonDateTime("2026-07-02","12:30").toISOString(),"2026-07-02T16:30:00.000Z");
 for(const [date,time] of [["2026-03-08","02:30"],["2026-11-01","01:30"],["2026-02-30","12:00"],["oops","12:00"]])
  assert.equal(bostonDateTime(date,time),null);
});
test("web requests persist once, retain notes, enforce fare and stay pending",async()=>{
 const db=new PGlite();let breakAudit=false,breakQueue=false,quoteCalls=0,clock=Date.parse("2026-10-27T12:00:00Z");
 const query=async(sql,args)=>{
  if(breakQueue&&sql.startsWith("INSERT INTO dispatch_notifications"))throw Error("simulated queue failure");
  if(breakAudit&&sql.startsWith("INSERT INTO dispatch_audit"))throw Error("simulated audit failure");
  const r=await db.query(sql,args);return {...r,rowCount:r.affectedRows||r.rows.length};
 };
 const pool={query,connect:async()=>({query,release(){}})};
 await db.exec(fs.readFileSync(__dirname+"/schema.sql","utf8").split("-- Public intake metadata")[0]);
 const database=(await query("SELECT current_database() AS name")).rows[0].name;
 await assert.rejects(ensureIntakeSchema(pool,"wrong-database"));
 await ensureIntakeSchema(pool,database);await ensureIntakeSchema(pool,database);
 await db.exec(require("./notifications").SCHEMA);
 const app=express();app.use(express.json());app.post("/request",createIntakeHandler({pool,now:()=>clock,calculateFare:async()=>{quoteCalls++;return {amount:10000};}}));
 const server=app.listen(0,"127.0.0.1");await new Promise(resolve=>server.once("listening",resolve));
 const base="http://127.0.0.1:"+server.address().port;
 const body={name:"Fictitious passenger",phone:"0000000000",email:"test@example.invalid",from:"Test pickup",to:"Test destination",date:"2026-11-02",time:"12:30",passengers:"3",details:"Fictitious flight and luggage notes",payment:"coordinate",expectedFareCents:10000,requestId:crypto.randomUUID(),status:"assigned",driverId:crypto.randomUUID()};
 async function send(data){const r=await fetch(base+"/request",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});return {status:r.status,body:await r.json()};}
 try{
  const first=await send(body);assert.equal(first.status,200);assert.equal(first.body.pendingApproval,true);
  const duplicate=await send(body);assert.equal(duplicate.status,200);assert.equal(duplicate.body.reference,first.body.reference);assert.equal(quoteCalls,1);
  assert.equal((await send({...body,details:"Changed request"})).status,409);
  const notices=(await query("SELECT * FROM dispatch_notifications")).rows;assert.equal(notices.length,2);assert.ok(notices.every(row=>row.status==="suppressed"));
  const rows=(await query("SELECT * FROM bookings")).rows;assert.equal(rows.length,1);assert.equal(rows[0].status,"pending");
  assert.equal(rows[0].request_metadata.details,body.details);assert.equal(rows[0].request_metadata.passengers,3);
  assert.equal(new Date(rows[0].pickup_at).toISOString(),"2026-11-02T17:30:00.000Z");
  assert.equal((await query("SELECT * FROM assignments")).rows.length,0);
  assert.equal((await query("SELECT * FROM dispatch_audit")).rows.length,1);
  assert.equal((await send({...body,requestId:crypto.randomUUID(),expectedFareCents:1})).status,409);
  assert.equal((await send({...body,requestId:crypto.randomUUID(),date:"2026-02-30"})).status,400);
  breakAudit=true;const retry={...body,requestId:crypto.randomUUID()};
  assert.equal((await send(retry)).status,503);
  assert.equal((await query("SELECT * FROM bookings")).rows.length,1);
  breakAudit=false;assert.equal((await send(retry)).status,200);
  assert.equal((await query("SELECT * FROM bookings")).rows.length,2);
  const legacy=await send({...body,requestId:crypto.randomUUID(),passengers:"6 or more"});assert.equal(legacy.status,200);
  assert.equal((await query("SELECT request_metadata FROM bookings WHERE reference=$1",[legacy.body.reference])).rows[0].request_metadata.passengers,"6 or more");
  clock+=60001;breakQueue=true;const queueRetry={...body,requestId:crypto.randomUUID()};
  assert.equal((await send(queueRetry)).status,503);
  assert.equal((await query("SELECT * FROM bookings")).rows.length,3);
  breakQueue=false;assert.equal((await send(queueRetry)).status,200);
  assert.equal((await query("SELECT * FROM bookings")).rows.length,4);

 }finally{await new Promise(resolve=>server.close(resolve));await db.close();}
});

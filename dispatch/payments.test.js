"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const crypto=require("node:crypto");
const express=require("express");
const Stripe=require("stripe");
const {PGlite}=require("@electric-sql/pglite");
const {createDispatchCheckout,createDispatchWebhook}=require("./payments");
test("checkout links one durable request to Stripe and only signed matching events confirm payment",async()=>{
 const db=new PGlite();
 const query=async(sql,args)=>{const r=await db.query(sql,args);return {...r,rowCount:r.affectedRows||r.rows.length};};
 const pool={query,connect:async()=>({query,release(){}})};
 await db.exec(fs.readFileSync(__dirname+"/schema.sql","utf8"));
 const sdk=new Stripe("sk_test_unit_only_no_network");
 const webhookSecret="whsec_unit_only_not_a_live_secret";
 const sessions=new Map(),created=[];let failNext=false;
 const stripe={webhooks:sdk.webhooks,checkout:{sessions:{create:async(data,options)=>{
  if(failNext){failNext=false;throw Error("simulated checkout failure");}
  created.push({data,options});
  if(!sessions.has(options.idempotencyKey))sessions.set(options.idempotencyKey,{id:"cs_test_"+crypto.randomUUID(),url:"https://checkout.stripe.com/c/pay/test_only"});
  return sessions.get(options.idempotencyKey);
 }}}};
 const app=express();
 app.post("/webhook",express.raw({type:"application/json"}),createDispatchWebhook({pool,stripe,webhookSecret,testOnly:true}));
 app.use(express.json());
 app.post("/checkout",createDispatchCheckout({pool,stripe,origin:"https://dispatch.example",calculateFare:async()=>({amount:10000}),now:()=>Date.parse("2026-10-27T12:00:00Z")}));
 const server=app.listen(0,"127.0.0.1");await new Promise(resolve=>server.once("listening",resolve));
 const base="http://127.0.0.1:"+server.address().port;
 const body={name:"Fictitious customer",email:"customer@example.invalid",phone:"0000000000",from:"Test pickup",to:"Test destination",date:"2026-11-02",time:"12:30",passengers:"1",payment:"now",expectedFareCents:10000,tipPercent:15,tipCents:0,requestId:crypto.randomUUID()};
 async function checkout(data){const r=await fetch(base+"/checkout",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});return {status:r.status,body:await r.json()};}
 async function event(type,session,extra={},sign=true){
  const payload=JSON.stringify({id:"evt_test_"+crypto.randomUUID(),livemode:false,type,data:{object:session},...extra});
  const signature=sign?sdk.webhooks.generateTestHeaderString({payload,secret:webhookSecret}):"invalid";
  return fetch(base+"/webhook",{method:"POST",headers:{"Content-Type":"application/json","Stripe-Signature":signature},body:payload});
 }
 try{
  const first=await checkout(body);assert.equal(first.status,200);assert.equal(first.body.received,true);
  const duplicate=await checkout(body);assert.equal(duplicate.status,200);assert.equal(duplicate.body.reference,first.body.reference);
  assert.equal(sessions.size,1);assert.equal(created[0].options.idempotencyKey,created[1].options.idempotencyKey);
  assert.equal(created[0].data.line_items[0].price_data.unit_amount,10000);
  assert.equal(created[0].data.line_items[1].price_data.unit_amount,1500);
  let booking=(await query("SELECT * FROM bookings")).rows[0];assert.equal(booking.status,"pending");assert.equal(booking.request_metadata.payment_status,"awaiting_payment");
  const paid={id:booking.request_metadata.stripe_session_id,currency:"usd",amount_total:11500,payment_status:"paid",metadata:{purpose:"pimentel_dispatch",bookingId:booking.id}};
  assert.equal((await event("checkout.session.completed",paid,{},false)).status,400);
  assert.equal((await event("checkout.session.completed",paid,{livemode:true})).status,400);
  assert.equal((await event("checkout.session.completed",{...paid,amount_total:1})).status,409);
  assert.equal((await event("checkout.session.completed",{...paid,id:"cs_wrong_session"})).status,409);
  assert.equal((await event("checkout.session.completed",{...paid,payment_status:"unpaid"})).status,200);
  assert.equal((await query("SELECT request_metadata FROM bookings WHERE id=$1",[booking.id])).rows[0].request_metadata.payment_status,"awaiting_payment");
  assert.equal((await event("checkout.session.completed",paid)).status,200);
  assert.equal((await event("checkout.session.completed",paid)).status,200);
  assert.equal((await event("checkout.session.expired",{...paid,payment_status:"unpaid"})).status,200);
  booking=(await query("SELECT * FROM bookings WHERE id=$1",[booking.id])).rows[0];
  assert.equal(booking.request_metadata.payment_status,"paid");assert.equal(booking.status,"pending");
  assert.equal((await query("SELECT * FROM dispatch_audit WHERE action='payment_paid'")).rows.length,1);
  assert.equal((await checkout(body)).status,409);
  failNext=true;const retry={...body,requestId:crypto.randomUUID()};
  const failed=await checkout(retry);assert.equal(failed.status,503);assert.ok(failed.body.error.includes("quedó guardada"));
  assert.equal((await query("SELECT * FROM bookings")).rows.length,2);
  assert.equal((await checkout(retry)).status,200);
  assert.equal((await query("SELECT * FROM bookings")).rows.length,2);assert.equal(sessions.size,2);
 }finally{await new Promise(resolve=>server.close(resolve));await db.close();}
});

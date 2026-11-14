'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {createAcceptanceMailer,registerAcceptanceRoute}=require('../booking-acceptance');
const booking={reference:'PT-TEST2026',status:'transferred',dispatch_trip_id:42,acceptance_notice_status:'pending',passenger_name:'Test Passenger',passenger_email:'test@example.com',pickup_local_date:'2026-11-20',pickup_local_time:'14:30',pickup_address:'Boston',destination_address:'Woburn',fare_cents:8000};
async function harness(t,{state='pending',notice='pending',send=async()=>'<message-id>',configured=true,admin=true}={}){
 const b={...booking,acceptance_notice_status:notice};let sent=0,approved=0,tripState=state;
 const query=async(sql,args)=>{
  if(sql.startsWith('SELECT * FROM booking_requests'))return {rows:[{...b}]};
  if(sql.startsWith('SELECT id,status FROM dispatch_trips'))return {rows:[{id:42,status:tripState}]};
  if(sql.includes("SET status='approved'")){approved++;tripState='approved'}
  if(sql.includes("acceptance_notice_status='sending'"))b.acceptance_notice_status='sending';
  if(sql.includes("acceptance_notice_status='sent'"))b.acceptance_notice_status='sent';
  if(sql.includes('acceptance_notice_status=$2'))b.acceptance_notice_status=args[1];
  return {rows:[],rowCount:1};
 };
 const db={query,connect:async()=>({query,release(){}})};
 const app=express();app.use((req,res,next)=>{req.session={userId:'admin'};next()});
 const r=express.Router();registerAcceptanceRoute(r,{db,requireAdmin:(req,res,next)=>admin?next():res.sendStatus(403),sendAcceptance:configured?async b=>{sent++;return send(b)}:null});app.use('/booking',r);
 app.use((e,req,res,next)=>res.sendStatus(500));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 return {post:()=>fetch('http://127.0.0.1:'+server.address().port+'/booking/'+b.reference+'/accept-and-notify',{method:'POST'}),b,get sent(){return sent},get approved(){return approved}};
}
test('administrator approves pending trip and sends acceptance only once',async t=>{const h=await harness(t);assert.equal((await h.post()).status,200);assert.equal(h.approved,1);assert.equal(h.sent,1);assert.equal((await h.post()).status,200);assert.equal(h.sent,1)});
test('driver and anonymous users cannot send acceptance',async t=>{const h=await harness(t,{admin:false});assert.equal((await h.post()).status,403);assert.equal(h.sent,0);assert.equal(h.approved,0)});
test('missing mail configuration does not approve or send',async t=>{const h=await harness(t,{configured:false});assert.equal((await h.post()).status,503);assert.equal(h.approved,0)});
test('cancelled and rejected trips cannot be accepted',async t=>{for(const state of ['cancelled','rejected','completed','no_show']){const h=await harness(t,{state});assert.equal((await h.post()).status,409);assert.equal(h.sent,0)}});
test('uncertain send blocks duplicate attempts',async t=>{const h=await harness(t,{send:async()=>{throw Error('timeout')}});assert.equal((await h.post()).status,502);assert.equal(h.b.acceptance_notice_status,'unknown');assert.equal((await h.post()).status,409);assert.equal(h.sent,1)});
test('explicit provider rejection allows a later manual retry',async t=>{const h=await harness(t,{send:async()=>{throw Object.assign(Error('rejected'),{deliveryRejected:true})}});assert.equal((await h.post()).status,502);assert.equal(h.b.acceptance_notice_status,'failed');assert.equal(h.approved,1)});
test('message includes exact reference, Boston time and no payment receipt claim',async()=>{let payload;const send=createAcceptanceMailer({apiKey:'test',senderEmail:'sender@example.com',fetchImpl:async(url,options)=>{payload=JSON.parse(options.body);return {ok:true,json:async()=>({messageId:'<test-message>'})}}});assert.equal(await send(booking),'<test-message>');assert.equal(payload.to[0].email,booking.passenger_email);assert.match(payload.textContent,/PT-TEST2026/);assert.match(payload.textContent,/America\/New_York/);assert.match(payload.textContent,/not a payment receipt/)});

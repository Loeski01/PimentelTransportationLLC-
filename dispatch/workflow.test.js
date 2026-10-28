"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const express=require("express");
const {PGlite}=require("@electric-sql/pglite");
test("PostgreSQL workflow and isolation between drivers",async()=>{
 const db=new PGlite();
 process.env.ENABLE_DISPATCH_BOOKING_INTAKE="true";
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
  for(const password of ["123","12345","12a4",1234]){
   assert.equal((await request("/drivers","POST",{name:"Invalid PIN",email:"invalid@example.com",phone:"000",vehicle:"Test",password},admin)).status,400);
   assert.equal((await request("/login","POST",{email:"driver0@example.com",password})).status,400);
  }
  const drivers=[];
  for(let i=0;i<2;i++){
   const email="driver"+i+"@example.com",password="0123";
   let r=await request("/drivers","POST",{name:"Test "+i,email,phone:"5550000000",vehicle:"Test SUV",password},admin);
   assert.equal(r.status,201);assert.equal(r.body.password_hash,undefined);
   const id=r.body.id;
   r=await request("/login","POST",{email,password});assert.equal(r.status,200);
   drivers.push({id,headers:{Authorization:"Bearer "+r.body.token}});
  }
  assert.equal((await request("/bookings")).status,401);
  assert.equal((await request("/drivers","GET",undefined,drivers[0].headers)).status,403);
  assert.equal((await request("/notifications","GET",undefined,drivers[0].headers)).status,403);
  let r=await request("/bookings","POST",{customerName:"Fictitious Customer",customerEmail:"customer@example.com",customerPhone:"5550000000",pickup:"Test pickup",destination:"Test destination",pickupAt:"2026-11-01T12:00:00Z",estimatedFareCents:10000},admin);
  assert.equal(r.status,201);const booking=r.body.id;
  await db.query("UPDATE bookings SET request_metadata=$1::jsonb WHERE id=$2",[JSON.stringify({details:"Fictitious flight notes",passengers:3}),booking]);
  assert.equal((await request("/bookings/"+booking+"/assign","POST",{driverId:drivers[0].id},admin)).status,409);
  await db.query("UPDATE bookings SET request_metadata=request_metadata||$1::jsonb WHERE id=$2",[JSON.stringify({payment:"now",payment_status:"awaiting_payment"}),booking]);
  assert.equal((await request("/bookings/"+booking+"/approve","POST",{},admin)).status,409);
  await db.query("UPDATE bookings SET request_metadata=request_metadata||$1::jsonb WHERE id=$2",[JSON.stringify({payment_status:"paid"}),booking]);
  assert.equal((await request("/bookings/"+booking+"/approve","POST",{},admin)).status,200);
  await db.query("UPDATE drivers SET pin_configured=false WHERE id=$1",[drivers[0].id]);
  assert.equal((await request("/bookings/"+booking+"/assign","POST",{driverId:drivers[0].id},admin)).status,404);
  assert.equal((await request("/my-assignments","GET",undefined,drivers[0].headers)).status,401);
  await db.query("UPDATE drivers SET pin_configured=true WHERE id=$1",[drivers[0].id]);
  r=await request("/bookings/"+booking+"/assign","POST",{driverId:drivers[0].id},admin);assert.equal(r.status,201);let assignment=r.body.id;
  assert.equal((await request("/bookings/"+booking+"/assign","POST",{driverId:drivers[1].id},admin)).status,409);
  assert.deepEqual((await request("/my-assignments","GET",undefined,drivers[1].headers)).body,[]);
  assert.equal((await request("/my-assignments/"+assignment+"/respond","POST",{status:"accepted"},drivers[1].headers)).status,409);
  assert.equal((await request("/my-assignments/"+assignment+"/respond","POST",{status:"rejected"},drivers[0].headers)).status,200);
  r=await request("/bookings/"+booking+"/assign","POST",{driverId:drivers[1].id},admin);assert.equal(r.status,201);assignment=r.body.id;
  assert.equal((await request("/bookings/"+booking+"/release","POST",{},drivers[0].headers)).status,403);
  assert.equal((await request("/bookings/"+booking+"/release","POST",{},admin)).status,200);
  assert.equal((await request("/my-assignments/"+assignment+"/respond","POST",{status:"accepted"},drivers[1].headers)).status,409);
  r=await request("/bookings/"+booking+"/assign","POST",{driverId:drivers[1].id},admin);assert.equal(r.status,201);assignment=r.body.id;
  assert.equal((await request("/my-assignments/"+assignment+"/start","POST",{},drivers[1].headers)).status,409);
  let privateTrip=(await request("/my-assignments","GET",undefined,drivers[1].headers)).body.find(t=>t.id===assignment);
  assert.equal(privateTrip.customer_name,null);assert.equal(privateTrip.customer_phone,null);
  assert.equal((await request("/my-assignments/"+assignment+"/respond","POST",{status:"accepted"},drivers[1].headers)).status,200);
  privateTrip=(await request("/my-assignments","GET",undefined,drivers[1].headers)).body.find(t=>t.id===assignment);
  assert.equal(privateTrip.customer_name,"Fictitious Customer");assert.equal(privateTrip.customer_phone,"5550000000");assert.equal(privateTrip.details,"Fictitious flight notes");assert.equal(privateTrip.passengers,"3");
  const allowed=new Set(['id','status','trip_stage','booking_status','reference','pickup','destination','pickup_at','customer_name','customer_phone','details','passengers']);
  assert.ok(Object.keys(privateTrip).every(key=>allowed.has(key)),"Driver API must not disclose pricing, tips or payment metadata");
  assert.equal(privateTrip.estimated_fare_cents,undefined);assert.equal(privateTrip.request_metadata,undefined);


  assert.equal((await request("/my-assignments/"+assignment+"/complete","POST",{},drivers[1].headers)).status,409);
  assert.equal((await request("/my-assignments/"+assignment+"/start","POST",{},drivers[1].headers)).status,200);
  // An older open client may have started a trip during the deployment transition.
  await db.query("UPDATE assignments SET trip_stage='not_started' WHERE id=$1",[assignment]);
  const continued=(await request("/my-assignments","GET",undefined,drivers[1].headers)).body.find(t=>t.id===assignment);
  assert.equal(continued.trip_stage,"on_the_way");

  assert.equal((await request("/my-assignments/"+assignment+"/complete","POST",{},drivers[1].headers)).status,409);
  assert.equal((await request("/my-assignments/"+assignment+"/onboard","POST",{},drivers[1].headers)).status,409);
  assert.equal((await request("/my-assignments/"+assignment+"/arrive","POST",{},drivers[0].headers)).status,409);
  assert.equal((await request("/my-assignments/"+assignment+"/arrive","POST",{},drivers[1].headers)).status,200);
  assert.equal((await request("/my-assignments/"+assignment+"/arrive","POST",{},drivers[1].headers)).status,409);
  assert.equal((await request("/my-assignments/"+assignment+"/onboard","POST",{},drivers[1].headers)).status,200);
  const progress=(await request("/bookings","GET",undefined,admin)).body.find(b=>b.id===booking);
  assert.equal(progress.driver_stage,"passenger_onboard");assert.equal(progress.driver_name,"Test 1");

  assert.equal((await request("/my-assignments/"+assignment+"/complete","POST",{},drivers[1].headers)).status,200);
  assert.equal((await request("/my-assignments/"+assignment+"/complete","POST",{},drivers[1].headers)).status,409);
  privateTrip=(await request("/my-assignments","GET",undefined,drivers[1].headers)).body.find(t=>t.id===assignment);
  assert.equal(privateTrip.customer_name,null);assert.equal(privateTrip.customer_phone,null);
  const noticeList=await request("/notifications","GET",undefined,admin);assert.equal(noticeList.status,200);assert.equal(noticeList.body.enabled,false);assert.ok(noticeList.body.rows.every(row=>row.status==="suppressed"));
  const notificationId=noticeList.body.rows[0].id;
  assert.equal((await request('/notifications/'+notificationId+'/retry','POST',{},drivers[1].headers)).status,403);
  assert.equal((await request('/notifications/'+notificationId+'/retry','POST',{},admin)).status,409);
  await db.query("UPDATE dispatch_notifications SET status='failed',last_error_code='DELIVERY_UNKNOWN' WHERE id=$1",[notificationId]);
  process.env.ENABLE_DISPATCH_EMAIL_NOTIFICATIONS='true';
  assert.equal((await request('/notifications/'+notificationId+'/retry','POST',{},admin)).status,409);
  assert.equal((await request('/notifications/'+notificationId+'/retry','POST',{confirmDeliveryReview:true},admin)).status,200);
  delete process.env.ENABLE_DISPATCH_EMAIL_NOTIFICATIONS;
  const rows=(await db.query("SELECT status FROM bookings WHERE id=$1",[booking])).rows;assert.equal(rows[0].status,"completed");
  const audit=(await db.query("SELECT action FROM dispatch_audit ORDER BY id")).rows.map(r=>r.action);
  assert.deepEqual(audit,["created","approved","assigned","rejected","assigned","assignment_released","assigned","accepted","started","driver_arrived","passenger_onboard","completed","notification_retry"]);
  assert.equal((await request("/bookings/"+booking+"/cancel","POST",{},admin)).status,409);
  r=await request("/bookings","POST",{customerName:"Cancel Test",customerEmail:"cancel@example.com",customerPhone:"5550000000",pickup:"Test pickup",destination:"Test destination",pickupAt:"2026-11-01T12:00:00Z",estimatedFareCents:10000},admin);
  assert.equal(r.status,201);const cancelled=r.body.id;
  await request("/bookings/"+cancelled+"/approve","POST",{},admin);
  r=await request("/bookings/"+cancelled+"/assign","POST",{driverId:drivers[0].id},admin);const revoked=r.body.id;
  await request("/my-assignments/"+revoked+"/respond","POST",{status:"accepted"},drivers[0].headers);
  assert.equal((await request("/bookings/"+cancelled+"/cancel","POST",{},admin)).status,200);
  assert.equal((await request("/my-assignments/"+revoked+"/start","POST",{},drivers[0].headers)).status,409);
  assert.equal((await request("/bookings/"+cancelled+"/assign","POST",{driverId:drivers[0].id},admin)).status,409);
  assert.equal((await request("/drivers/"+drivers[0].id+"/password","POST",{password:"0456"},drivers[0].headers)).status,403);
  assert.equal((await request("/drivers/"+drivers[0].id+"/password","POST",{password:"short"},admin)).status,400);
  assert.equal((await request("/drivers/"+drivers[0].id+"/password","POST",{password:"0456"},admin)).status,200);
  assert.equal((await request("/my-assignments","GET",undefined,drivers[0].headers)).status,401);
  assert.equal((await request("/login","POST",{email:"driver0@example.com",password:"0123"})).status,401);
  assert.equal((await request("/login","POST",{email:"driver0@example.com",password:"0456"})).status,200);
  for(let i=0;i<5;i++)assert.equal((await request("/login","POST",{email:"driver0@example.com",password:"9999"})).status,401);
  assert.equal((await request("/login","POST",{email:"driver0@example.com",password:"0456"})).status,429);
  require("./driver-pin-policy").driverLimiter.clear("driver0@example.com");
  assert.equal((await request("/login","POST",{email:"driver0@example.com",password:"0456"})).status,429);
  assert.equal((await request("/drivers/"+drivers[0].id+"/password","POST",{password:"0789"},admin)).status,200);
  assert.equal((await request("/login","POST",{email:"driver0@example.com",password:"0789"})).status,200);

  await db.query("WITH seeded AS (INSERT INTO bookings(reference,customer_name,customer_email,customer_phone,pickup,destination,pickup_at,estimated_fare_cents,status) SELECT 'HISTORY-'||g::text,'Fictitious history','history@example.invalid','0000000000','Old pickup','Old destination',now()+(g*interval '100 days'),0,'completed' FROM generate_series(1,120) g RETURNING id) INSERT INTO assignments(booking_id,driver_id,status,trip_stage) SELECT id,$1,'completed','completed' FROM seeded",[drivers[1].id]);
  r=await request("/bookings","POST",{customerName:"Upcoming priority",customerEmail:"upcoming@example.invalid",customerPhone:"0000000000",pickup:"Next pickup",destination:"Next destination",pickupAt:"2026-11-01T12:00:00Z",estimatedFareCents:10000},admin);
  const upcoming=r.body.id;await request("/bookings/"+upcoming+"/approve","POST",{},admin);
  const next=await request("/bookings/"+upcoming+"/assign","POST",{driverId:drivers[1].id},admin);
  const visible=(await request("/my-assignments","GET",undefined,drivers[1].headers)).body;
  assert.equal(visible.length,100);assert.equal(visible[0].id,next.body.id);
  assert.equal((await request("/drivers/"+drivers[1].id,"PATCH",{active:false},admin)).status,200);
  assert.equal((await request("/my-assignments","GET",undefined,drivers[1].headers)).status,401);
 }finally{
  await new Promise(resolve=>server.close(resolve));
  dispatch.pool.query=originalQuery;dispatch.pool.connect=originalConnect;
  await dispatch.pool.end();await db.close();
 }
});

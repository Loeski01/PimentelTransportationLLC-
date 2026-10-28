"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const crypto=require("node:crypto");
const {PGlite}=require("@electric-sql/pglite");
const {enqueueNotification,notificationMessage,createNotificationWorker}=require("./notifications");
test("driver notification includes only the portal and no customer or financial data",()=>{
 const booking={reference:"PRIVATE-REFERENCE",customer_name:"PRIVATE-NAME",customer_phone:"PRIVATE-PHONE",pickup:"PRIVATE-PICKUP",destination:"PRIVATE-DESTINATION",estimated_fare_cents:15500,request_metadata:{tipCents:2000,details:"PRIVATE-NOTES"}};
 const message=notificationMessage("driver_offer",booking,{email:"driver@example.invalid"},{origin:"https://dispatch.example",adminEmail:"owner@example.invalid"});
 const json=JSON.stringify(message);
 for(const hidden of ["PRIVATE-","15500","2000","$155","$20"])assert.ok(!json.includes(hidden));
 assert.ok(message.text.includes("https://dispatch.example/conductores/"));
 assert.equal(message.to,"driver@example.invalid");
});
test("notification jobs survive failures, deduplicate and avoid uncertain repeat sends",async()=>{
 const db=new PGlite();const workers=[];let failMarkSent=false;
 const query=async(sql,args)=>{
  if(failMarkSent&&sql.includes("SET status='sent'")){failMarkSent=false;throw Error("simulated database failure");}
  const result=await db.query(sql,args);return {...result,rowCount:result.affectedRows||result.rows.length};
 };
 const pool={query};
 await db.exec(fs.readFileSync(__dirname+"/schema.sql","utf8"));
 async function booking(){
  return (await query("INSERT INTO bookings(reference,customer_name,customer_email,customer_phone,pickup,destination,pickup_at,estimated_fare_cents) VALUES($1,'Fictitious Customer','customer@example.invalid','0000000000','Test Pickup','Test Destination',now()+interval '1 day',15500) RETURNING id",[crypto.randomUUID()])).rows[0].id;
 }
 function worker(sendEmail,enabled=true){const value=createNotificationWorker({pool,sendEmail,origin:"https://dispatch.example",adminEmail:"owner@example.invalid",enabled});workers.push(value);return value;}
 try{
  const id=await booking();
  const job={bookingId:id,kind:"customer_request",enabled:true};
  await enqueueNotification(pool,job);await enqueueNotification(pool,job);
  assert.equal((await query("SELECT * FROM dispatch_notifications")).rows.length,1);
  const failed=worker(async()=>{throw Error("mock provider unavailable");});
  assert.equal(await failed.runOnce(),false);failed.stop();
  let row=(await query("SELECT * FROM dispatch_notifications")).rows[0];
  assert.equal(row.status,"pending");assert.equal(row.attempts,1);
  assert.equal((await query("SELECT status FROM bookings WHERE id=$1",[id])).rows[0].status,"pending");
  await query("UPDATE dispatch_notifications SET next_attempt_at=now()-interval '1 minute'");
  const sent=[];const resumed=worker(async message=>sent.push(message));
  assert.equal(await resumed.runOnce(),true);
  row=(await query("SELECT * FROM dispatch_notifications")).rows[0];assert.equal(row.status,"sent");assert.equal(row.attempts,2);
  assert.equal(sent[0].idempotencyKey,row.id);assert.equal(sent[0].to,"customer@example.invalid");
  assert.equal(await resumed.runOnce(),false);
  const suppressedId=await booking();await enqueueNotification(pool,{bookingId:suppressedId,kind:"admin_request",enabled:false});
  assert.equal(await resumed.runOnce(),false);
  assert.equal(await worker(async()=>assert.fail("disabled worker sent an email"),false).runOnce(),false);
  const unknownId=await booking();await enqueueNotification(pool,{bookingId:unknownId,kind:"admin_request",enabled:true});
  failMarkSent=true;
  assert.equal(await resumed.runOnce(),false);
  row=(await query("SELECT * FROM dispatch_notifications WHERE booking_id=$1",[unknownId])).rows[0];
  assert.equal(row.status,"failed");assert.equal(row.last_error_code,"DELIVERY_UNKNOWN");
  assert.equal(await resumed.runOnce(),false);assert.equal(sent.length,2);
  const staleId=await booking();
  const driver=(await query("INSERT INTO drivers(name,email,phone,password_hash,pin_configured) VALUES('Fictitious Driver','driver@example.invalid','0000000000','unused',true) RETURNING id")).rows[0].id;
  const assignment=(await query("INSERT INTO assignments(booking_id,driver_id,status) VALUES($1,$2,'revoked') RETURNING id",[staleId,driver])).rows[0].id;
  await enqueueNotification(pool,{bookingId:staleId,assignmentId:assignment,kind:"driver_offer",enabled:true});
  assert.equal(await resumed.runOnce(),true);
  assert.equal((await query("SELECT status FROM dispatch_notifications WHERE assignment_id=$1",[assignment])).rows[0].status,"obsolete");
  assert.equal(sent.length,2);
  const leasedId=await booking();await enqueueNotification(pool,{bookingId:leasedId,kind:"admin_request",enabled:true});
  await query("UPDATE dispatch_notifications SET status='sending',attempts=1,lease_until=now()-interval '1 minute' WHERE booking_id=$1",[leasedId]);
  assert.equal(await resumed.runOnce(),true);
  assert.equal((await query("SELECT status FROM dispatch_notifications WHERE booking_id=$1",[leasedId])).rows[0].status,"sent");
  const tooOld=await booking();await enqueueNotification(pool,{bookingId:tooOld,kind:"admin_request",enabled:true});
  await query("UPDATE dispatch_notifications SET status='sending',attempts=1,lease_until=now()-interval '31 minutes' WHERE booking_id=$1",[tooOld]);
  assert.equal(await resumed.runOnce(),false);
  const oldJob=(await query("SELECT status,last_error_code FROM dispatch_notifications WHERE booking_id=$1",[tooOld])).rows[0];
  assert.equal(oldJob.status,"failed");assert.equal(oldJob.last_error_code,"DELIVERY_UNKNOWN");assert.equal(sent.length,3);

 }finally{for(const value of workers)value.stop();await db.close();}
});

"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {PGlite}=require("@electric-sql/pglite");
const {groupTrips,nextAction,statusLabel}=require("./public/journey");
const {ensureJourneySchema}=require("./journey-schema");
test("driver trip groups put upcoming pickups in order and keep closed trips in history",()=>{
 const rows=[
  {id:"later",status:"accepted",booking_status:"assigned",pickup_at:"2026-11-03T12:00:00Z"},
  {id:"finished",status:"completed",booking_status:"completed",pickup_at:"2026-11-04T12:00:00Z"},
  {id:"earlier",status:"accepted",booking_status:"assigned",pickup_at:"2026-11-02T12:00:00Z"},
  {id:"offer",status:"offered",booking_status:"assigned",pickup_at:"2026-11-02T10:00:00Z"},
  {id:"active",status:"accepted",booking_status:"in_progress",pickup_at:"2026-11-02T09:00:00Z"},
  {id:"withdrawn",status:"revoked",booking_status:"assigned",pickup_at:"2026-11-02T08:00:00Z"}
 ];
 const groups=groupTrips(rows);
 assert.deepEqual(groups.upcoming.map(t=>t.id),["earlier","later"]);
 assert.deepEqual(groups.offers.map(t=>t.id),["offer"]);
 assert.deepEqual(groups.active.map(t=>t.id),["active"]);
 assert.deepEqual(groups.history.map(t=>t.id),["finished","withdrawn"]);
 assert.equal(rows[0].id,"later");
});
test("only the next driver milestone is offered and no closed trip has actions",()=>{
 const base={status:"accepted",booking_status:"assigned",trip_stage:"not_started"};
 assert.equal(nextAction(base).path,"start");
 for(const [stage,path] of [["on_the_way","arrive"],["arrived","onboard"],["passenger_onboard","complete"]])
  assert.equal(nextAction({...base,booking_status:"in_progress",trip_stage:stage}).path,path);
 for(const status of ["offered","rejected","revoked","completed"])assert.equal(nextAction({...base,status}),null);
 assert.equal(nextAction({...base,booking_status:"completed"}),null);
 assert.equal(statusLabel({...base,trip_stage:"arrived"}),"En el punto de recogida");
 assert.equal(statusLabel({...base,booking_status:"cancelled"}),"Cancelado");
});
test("journey migration restores old in-progress trips without resetting recorded milestones",async()=>{
 const db=new PGlite();
 const query=async(sql,args)=>{
  if(sql==="SELECT current_database() AS name")return {rows:[{name:"pimentel_dispatch_dev"}]};
  return db.query(sql,args);
 };
 try{
  await db.exec(fs.readFileSync(__dirname+"/schema.sql","utf8"));
  const driver=(await db.query("INSERT INTO drivers(name,email,phone,password_hash) VALUES('Test','driver@example.invalid','000','unused') RETURNING id")).rows[0].id;
  const booking=(await db.query("INSERT INTO bookings(reference,customer_name,customer_email,customer_phone,pickup,destination,pickup_at,estimated_fare_cents,status) VALUES('TEST','Test','test@example.invalid','000','pickup','destination',now(),0,'in_progress') RETURNING id")).rows[0].id;
  await db.query("INSERT INTO assignments(booking_id,driver_id,status) VALUES($1,$2,'accepted')",[booking,driver]);
  await ensureJourneySchema({query});
  assert.equal((await db.query("SELECT trip_stage FROM assignments")).rows[0].trip_stage,"on_the_way");
  await db.query("UPDATE assignments SET trip_stage='arrived'");
  await ensureJourneySchema({query});
  assert.equal((await db.query("SELECT trip_stage FROM assignments")).rows[0].trip_stage,"arrived");
  await assert.rejects(ensureJourneySchema({query:async()=>({rows:[{name:"wrong_database"}]})}));
 }finally{await db.close();}
});

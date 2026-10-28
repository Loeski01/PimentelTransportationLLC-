"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {tripNavigation,mapUrl}=require("./public/navigation");
test("navigation routes each accepted trip leg to the selected map provider",()=>{
 const trip={status:"accepted",booking_status:"assigned",pickup:"Terminal B, Logan Airport, Boston, MA",destination:"123 Main St #2 & Oak, Woburn, MA",estimated_fare_cents:15500,tipCents:2000,customer_name:"Private passenger",customer_phone:"5550000000",reference:"PRIVATE-REF"};
 for(const provider of ["google","apple","waze"]){
  const links=tripNavigation(trip,provider);
  const param=provider==="waze"?"q":"destination";
  assert.equal(new URL(links.pickup).searchParams.get(param),trip.pickup);
  assert.equal(new URL(links.destination).searchParams.get(param),trip.destination);
  assert.ok(!JSON.stringify(links).includes("15500"));
  assert.ok(!JSON.stringify(links).includes("2000"));
  assert.ok(!JSON.stringify(links).includes("PRIVATE-REF"));
  assert.ok(!JSON.stringify(links).includes("5550000000"));
  assert.equal(new URL(links.pickup).protocol,"https:");
 }
 assert.equal(new URL(mapUrl("google",trip.pickup)).searchParams.get("dir_action"),"navigate");
 assert.equal(new URL(mapUrl("google",trip.pickup)).searchParams.has("origin"),false);
});
test("retired or unaccepted assignments have no navigation actions",()=>{
 for(const status of ["offered","rejected","revoked","completed"])
  assert.equal(tripNavigation({status,booking_status:"assigned"},"google"),null);
 for(const booking_status of ["cancelled","completed","pending"])
  assert.equal(tripNavigation({status:"accepted",booking_status},"google"),null);
 assert.equal(mapUrl("untrusted","Boston"),null);
 assert.equal(mapUrl("google",""),null);
 const url=new URL(mapUrl("google","Boston & api=other # <script>"));
 assert.equal(url.searchParams.get("destination"),"Boston & api=other # <script>");
 assert.equal(url.searchParams.get("api"),"1");
});

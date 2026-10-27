"use strict";
// Private development database smoke check. Never prints credentials or customer data.
// Usage: DATABASE_URL=<internal URL> node dispatch/verify-db.js
const {Client}=require("pg");
(async()=>{
 if(!process.env.DATABASE_URL)throw Error("DATABASE_URL is required");
 const client=new Client({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==="disable"?false:undefined});
 await client.connect();
 try{
  const name=(await client.query("SELECT current_database() AS name")).rows[0].name;
  if(name!=="pimentel_dispatch_dev")throw Error("Unexpected database; refusing verification");
  const r=await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name=ANY($1::text[]) ORDER BY table_name",[["drivers","bookings","assignments","dispatch_audit","driver_sessions"]]);
  const found=r.rows.map(x=>x.table_name);
  const missing=["drivers","bookings","assignments","dispatch_audit","driver_sessions"].filter(x=>!found.includes(x));
  console.log(JSON.stringify({database:name,ready:missing.length===0,found,missing},null,2));
  if(missing.length)process.exitCode=2;
 }finally{await client.end();}
})().catch(e=>{console.error("Database verification failed:",e.message);process.exitCode=1;});

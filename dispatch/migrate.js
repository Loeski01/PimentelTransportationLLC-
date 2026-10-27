"use strict";
// Run only against the private DEVELOPMENT database:
// DATABASE_URL=<private Render internal URL> node dispatch/migrate.js
// Do not execute on production until reviewed.
const fs=require("node:fs");
const path=require("node:path");
const {Client}=require("pg");
async function main(){
 if(process.env.DISPATCH_MIGRATION_TARGET!=="development")throw new Error("Set DISPATCH_MIGRATION_TARGET=development to acknowledge target");
 if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL is required");
 const client=new Client({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==="disable"?false:undefined});
 await client.connect();
 try{
  const db=await client.query("SELECT current_database() AS name");
  if(db.rows[0].name!=="pimentel_dispatch_dev")throw new Error("Refusing migration on unexpected database: "+db.rows[0].name);
  await client.query("BEGIN");
  await client.query(fs.readFileSync(path.join(__dirname,"schema.sql"),"utf8"));
  await client.query("COMMIT");
  console.log("Dispatch development schema applied successfully");
 }catch(error){await client.query("ROLLBACK");throw error;}
 finally{await client.end();}
}
main().catch(error=>{console.error("Migration failed:",error.message);process.exitCode=1;});

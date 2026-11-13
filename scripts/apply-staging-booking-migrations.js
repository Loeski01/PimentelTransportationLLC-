'use strict';
// Run ONLY from an internal Render instance connected to the intended staging DB.
// Explicit opt-in; transaction rollback on failure; never deletes existing records.
const fs=require('node:fs'),path=require('node:path'),{Pool}=require('pg');
async function main(){
 if(process.env.CONFIRM_STAGING_BOOKING_MIGRATION!=='YES')throw Error('Explicit migration approval missing');
 if(process.env.NODE_ENV==='production')throw Error('Production migration blocked');
 const url=process.env.BOOKING_DATABASE_URL||process.env.DISPATCH_DATABASE_URL;
 if(!url)throw Error('Missing internal staging database URL');
 const db=new Pool({connectionString:url,max:1,connectionTimeoutMillis:5000});
 try{
  const identity=await db.query('SELECT current_database() AS name');
  if(identity.rows[0].name!=='pimentel_dispatch_dev')throw Error('Unexpected database; migration aborted');
  const scripts=['booking/migrations/001_booking_requests_staging.sql','dispatch/migrations/002_booking_reference_staging.sql'];
  const existing=await db.query("SELECT to_regclass('public.dispatch_trips') IS NOT NULL AS exists");
  if(!existing.rows[0].exists)throw Error('Dispatch trips table missing; refusing migration');
  for(const file of scripts){
   const sql=fs.readFileSync(path.resolve(__dirname,'..',file),'utf8');
   await db.query(sql);
   console.log('Applied safely:',file);
  }
  const verified=await db.query(`SELECT to_regclass('public.booking_requests') IS NOT NULL AS bookings,
   EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='dispatch_trips'
   AND column_name='booking_reference') AS reference_column`);
  if(!verified.rows[0].bookings||!verified.rows[0].reference_column)throw Error('Schema verification failed');
  console.log('Schema verified:',JSON.stringify(verified.rows[0]));
 }finally{await db.end()}
}
main().catch(e=>{console.error('Migration stopped:',e.code||e.message);process.exitCode=1});

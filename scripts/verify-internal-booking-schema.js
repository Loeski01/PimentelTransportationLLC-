'use strict';
// Read-only verification from a Render service with an internal PostgreSQL URL.
// Never prints credentials or passenger information.
const {Pool}=require('pg');
async function main(){
 const url=process.env.BOOKING_DATABASE_URL || process.env.DISPATCH_DATABASE_URL;
 if(!url)throw Error('Internal PostgreSQL connection is not configured');
 const db=new Pool({connectionString:url,connectionTimeoutMillis:5000,max:1});
 try{
  const q=await db.query(`SELECT
   to_regclass('public.booking_requests') IS NOT NULL AS booking_requests_exists,
   to_regclass('public.dispatch_trips') IS NOT NULL AS dispatch_trips_exists,
   EXISTS(SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='dispatch_trips'
       AND column_name='booking_reference') AS booking_reference_exists`);
  const result=q.rows[0];
  console.log(JSON.stringify({databaseConnected:true,...result}));
  if(!result.booking_requests_exists || !result.dispatch_trips_exists || !result.booking_reference_exists)
   process.exitCode=2;
 }finally{await db.end()}
}
main().catch(e=>{console.error('Schema verification failed:',e.code||e.message);process.exitCode=1});

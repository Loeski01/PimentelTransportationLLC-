// Read-only preflight for dispatch test-data cleanup.
// Run inside the Render private network with DISPATCH_DATABASE_URL configured.
// Never prints passenger details, credentials or connection strings.
'use strict';
const {Pool}=require('pg');
async function main(){
 if(!process.env.DISPATCH_DATABASE_URL)throw Error('DISPATCH_DATABASE_URL missing');
 const pool=new Pool({connectionString:process.env.DISPATCH_DATABASE_URL,connectionTimeoutMillis:15000});
 const client=await pool.connect();
 try{
  await client.query('BEGIN READ ONLY');
  const names=['dispatch_trips','dispatch_drivers','dispatch_trip_audit','dispatch_admin_notifications'];
  const counts={};
  for(const name of names){
   const result=await client.query('SELECT COUNT(*)::int AS count FROM '+name);
   counts[name]=result.rows[0].count;
  }
  const assigned=await client.query("SELECT COUNT(*)::int AS count FROM dispatch_trips WHERE status IN ('started','accepted','assigned')");
  const driverStatus=await client.query("SELECT COUNT(*)::int AS count FROM dispatch_drivers WHERE active=TRUE");
  await client.query('COMMIT');
  console.log(JSON.stringify({readOnly:true,counts,assignedOrActiveTrips:assigned.rows[0].count,activeDrivers:driverStatus.rows[0].count,cleanupPerformed:false}));
 }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}
 finally{client.release();await pool.end()}
}
main().catch(e=>{console.error('Preflight failed:',e.code||e.name);process.exitCode=1});

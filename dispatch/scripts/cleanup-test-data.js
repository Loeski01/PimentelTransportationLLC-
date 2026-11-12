// Dispatch-only transactional cleanup. NEVER runs without explicit IDs and restore verification.
// Example (private runner only):
// DISPATCH_DATABASE_URL=... DISPATCH_RESTORE_VERIFIED=yes node dispatch/scripts/cleanup-test-data.js --trip-ids=1,2,... --driver-ids=1,2 --execute
'use strict';
const {Pool}=require('pg');
const args=process.argv.slice(2);
function parseIds(prefix,expected){
 const item=args.find(x=>x.startsWith(prefix+'='));
 if(!item)throw Error('Missing '+prefix);
 const ids=item.slice(prefix.length+1).split(',').map(x=>Number(x.trim()));
 if(ids.length!==expected||ids.some(x=>!Number.isSafeInteger(x)||x<=0)||new Set(ids).size!==expected)throw Error('Expected '+expected+' unique positive IDs for '+prefix);
 return ids;
}
async function main(){
 const tripIds=parseIds('--trip-ids',9),driverIds=parseIds('--driver-ids',2);
 const execute=args.includes('--execute');
 if(!process.env.DISPATCH_DATABASE_URL)throw Error('Missing DISPATCH_DATABASE_URL');
 if(execute&&process.env.DISPATCH_RESTORE_VERIFIED!=='yes')throw Error('Verified restore prerequisite not confirmed');
 const pool=new Pool({connectionString:process.env.DISPATCH_DATABASE_URL,connectionTimeoutMillis:15000});
 let client;
 try{
  client=await pool.connect();
  await client.query('BEGIN');
  // Lock records and fail closed on mismatches.
  const trips=await client.query('SELECT id,driver_id,status FROM dispatch_trips WHERE id=ANY($1::bigint[]) FOR UPDATE',[tripIds]);
  const drivers=await client.query('SELECT id FROM dispatch_drivers WHERE id=ANY($1::bigint[]) FOR UPDATE',[driverIds]);
  if(trips.rowCount!==9||drivers.rowCount!==2)throw Error('Record count mismatch; refusing cleanup');
  if(trips.rows.some(t=>t.status==='started'))throw Error('Started trip found; refusing cleanup');
  const other=await client.query('SELECT COUNT(*)::int AS n FROM dispatch_trips WHERE driver_id=ANY($1::bigint[]) AND NOT (id=ANY($2::bigint[]))',[driverIds,tripIds]);
  if(other.rows[0].n!==0)throw Error('Drivers referenced by other trips; refusing cleanup');
  const linked=await client.query('SELECT COUNT(*)::int AS n FROM dispatch_admin_notifications WHERE driver_id=ANY($1::bigint[]) AND NOT (trip_id=ANY($2::bigint[]))',[driverIds,tripIds]);
  if(linked.rows[0].n!==0)throw Error('Drivers referenced by other notifications; refusing cleanup');
  if(!execute){
   await client.query('ROLLBACK');
   console.log(JSON.stringify({dryRun:true,matchedTrips:9,matchedDrivers:2,cleanupPerformed:false}));
   return;
  }
  await client.query('DELETE FROM dispatch_admin_notifications WHERE trip_id=ANY($1::bigint[])',[tripIds]);
  await client.query('DELETE FROM dispatch_trip_audit WHERE trip_id=ANY($1::bigint[])',[tripIds]);
  const td=await client.query('DELETE FROM dispatch_trips WHERE id=ANY($1::bigint[])',[tripIds]);
  const dd=await client.query('DELETE FROM dispatch_drivers WHERE id=ANY($1::bigint[])',[driverIds]);
  if(td.rowCount!==9||dd.rowCount!==2)throw Error('Delete count mismatch; rolling back');
  await client.query('COMMIT');
  console.log(JSON.stringify({cleanupPerformed:true,deletedTrips:td.rowCount,deletedDrivers:dd.rowCount}));
 }catch(e){if(client)await client.query('ROLLBACK').catch(()=>{});throw e}
 finally{if(client)client.release();await pool.end()}
}
main().catch(e=>{console.error('Cleanup aborted:',e.message);process.exitCode=1});

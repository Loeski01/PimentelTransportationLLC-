// Compare a restored, isolated PostgreSQL database with the source before any cleanup.
// Read-only. Set DISPATCH_DATABASE_URL and DISPATCH_RESTORE_DATABASE_URL in a private runner.
// Never expose either URL or connect a restored database to the live service.
'use strict';
const {Pool}=require('pg');
const tables=['dispatch_drivers','dispatch_trips','dispatch_trip_audit','dispatch_admin_notifications'];
async function snapshot(url){
 const pool=new Pool({connectionString:url,connectionTimeoutMillis:15000});
 let client;
 try{
  client=await pool.connect();
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const counts={};
  for(const t of tables){
   const r=await client.query('SELECT COUNT(*)::integer AS n FROM '+t);
   counts[t]=r.rows[0].n;
  }
  const schema=await client.query("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1::text[]) ORDER BY table_name,ordinal_position",[tables]);
  await client.query('COMMIT');
  return {counts,columns:schema.rows};
 }catch(e){if(client)await client.query('ROLLBACK').catch(()=>{});throw e}
 finally{if(client)client.release();await pool.end()}
}
async function main(){
 const source=process.env.DISPATCH_DATABASE_URL,restore=process.env.DISPATCH_RESTORE_DATABASE_URL;
 if(!source||!restore)throw Error('Both private database URLs required');
 if(source===restore)throw Error('Source and restored database URLs must differ');
 const a=await snapshot(source),b=await snapshot(restore);
 const countsMatch=JSON.stringify(a.counts)===JSON.stringify(b.counts);
 const schemaMatch=JSON.stringify(a.columns)===JSON.stringify(b.columns);
 console.log(JSON.stringify({readOnly:true,sourceCounts:a.counts,restoreCounts:b.counts,countsMatch,schemaMatch,cleanupPerformed:false}));
 if(!countsMatch||!schemaMatch)process.exitCode=2;
}
main().catch(e=>{console.error('Restore comparison failed:',e.code||e.name);process.exitCode=1});

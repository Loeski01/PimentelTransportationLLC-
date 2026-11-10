// Run ONLY against a disposable PostgreSQL database, never production.
// Example: DISPATCH_STAGING_DATABASE_URL=... node scripts/verify-archive-postgres.js
const fs=require('node:fs');
const path=require('node:path');
const {Client}=require('pg');
const url=process.env.DISPATCH_STAGING_DATABASE_URL;
if(!url)throw Error('DISPATCH_STAGING_DATABASE_URL is required; production URL is never used');
if(process.env.DISPATCH_DATABASE_URL===url)throw Error('Refusing to test against configured dispatch database');
const client=new Client({connectionString:url,connectionTimeoutMillis:10000});
(async()=>{
 await client.connect();
 try{
  await client.query('BEGIN');
  await client.query('CREATE TEMP TABLE dispatch_trips (id INTEGER PRIMARY KEY, status TEXT NOT NULL, pickup_at TIMESTAMPTZ NOT NULL DEFAULT NOW()) ON COMMIT DROP');
  await client.query("INSERT INTO dispatch_trips(id,status) VALUES (1,'completed'),(2,'started'),(3,'pending'),(4,'completed')");
  const sql=fs.readFileSync(path.join(__dirname,'../migrations/005-trip-archiving.sql'),'utf8');
  // The migration index must be created against a temporary table only.
  const tempSql=sql.replace(/CREATE INDEX IF NOT EXISTS dispatch_trips_archived_at_idx/, 'CREATE INDEX IF NOT EXISTS dispatch_trips_archived_at_staging_idx');
  await client.query(tempSql);
  const result=await client.query("UPDATE dispatch_trips SET archived_at=NOW() WHERE status='completed' AND archived_at IS NULL RETURNING id");
  if(result.rowCount!==2)throw Error('Expected exactly two completed trips to archive');
  const active=await client.query("SELECT id FROM dispatch_trips WHERE archived_at IS NULL ORDER BY id");
  if(active.rows.map(r=>r.id).join(',')!=='2,3')throw Error('Active or pending trips were affected');
  const history=await client.query("SELECT id FROM dispatch_trips WHERE archived_at IS NOT NULL ORDER BY id");
  if(history.rows.map(r=>r.id).join(',')!=='1,4')throw Error('Archived history is incomplete');
  console.log('PASS: PostgreSQL migration, completed-only archive, active queue, retained history');
 }finally{
  await client.query('ROLLBACK').catch(()=>{});
  await client.end();
 }
})().catch(e=>{console.error('FAIL:',e.message);process.exitCode=1});

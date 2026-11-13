// Standalone dispatch service; not imported by the existing booking server.
const express=require('express'),crypto=require('node:crypto');
const {Pool}=require('pg'),session=require('express-session');
const PgStore=require('connect-pg-simple')(session);
const {rateLimit}=require('express-rate-limit');
const {createLoginRouter}=require('./login');
const {createDispatchRouter}=require('./router');
for(const k of ['DISPATCH_DATABASE_URL','DISPATCH_SESSION_SECRET']) if(!process.env[k]) throw Error('Missing '+k);
if(!process.env.DISPATCH_ADMIN_PASSWORD_HASH && !process.env.DISPATCH_ADMIN_PASSWORD) throw Error('Missing admin password configuration');
if(!process.env.DISPATCH_ADMIN_PASSWORD_HASH && process.env.DISPATCH_ADMIN_PASSWORD.length<16) throw Error('Admin password too short');
// Allow a Render secret as an iPhone-friendly alternative to an offline scrypt generator.
// Derive an in-memory hash at startup; never log or persist the plaintext password.
const adminPasswordHash=process.env.DISPATCH_ADMIN_PASSWORD_HASH || (()=>{
 const salt=crypto.randomBytes(16).toString('hex');
 return salt+':'+crypto.scryptSync(process.env.DISPATCH_ADMIN_PASSWORD,salt,64).toString('hex');
})();
if(process.env.DISPATCH_SESSION_SECRET.length<32) throw Error('Session secret too short');
const db=new Pool({connectionString:process.env.DISPATCH_DATABASE_URL,connectionTimeoutMillis:15000});
const app=express();
app.set('trust proxy',1);
app.use(express.json({limit:'16kb'}));
// Reject cross-site browser writes even when cookies are present.
app.use((req,res,next)=>{
 if(!['POST','PUT','PATCH','DELETE'].includes(req.method))return next();
 const origin=req.get('origin');
 if(!origin){
  const fetchSite=req.get('sec-fetch-site');
  if(fetchSite==='cross-site')return res.sendStatus(403);
  return next(); // Non-browser clients may omit Origin.
 }
 try{const u=new URL(origin);const host=req.get('host');if(u.host!==host||!['https:','http:'].includes(u.protocol))return res.sendStatus(403)}catch{return res.sendStatus(403)}
 next();
});
// Private browser panel served only by the standalone dispatch service.
app.get('/',(req,res)=>res.redirect('/panel'));
app.get('/panel',(req,res)=>{res.set('Cache-Control','no-store');res.set('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'");res.set('X-Content-Type-Options','nosniff');res.set('Referrer-Policy','no-referrer');res.sendFile(require('node:path').join(__dirname,'private-panel.html'))});
app.get('/manifest.webmanifest',(req,res)=>{res.type('application/manifest+json');res.set('Cache-Control','public, max-age=3600');res.sendFile(require('node:path').join(__dirname,'manifest.webmanifest'))});
app.get('/app-icon.svg',(req,res)=>{res.type('image/svg+xml');res.set('Cache-Control','public, max-age=86400');res.sendFile(require('node:path').join(__dirname,'app-icon.svg'))});
app.get('/health',(req,res)=>{res.set('Cache-Control','no-store').status(200).json({service:'pimentel-dispatch',status:'ok'})});
app.get('/ready',async(req,res)=>{try{await db.query('SELECT on_my_way_at,arrived_at,passenger_phone FROM dispatch_trips LIMIT 0');await db.query('SELECT 1 FROM dispatch_drivers LIMIT 0');await db.query('SELECT 1 FROM dispatch_trip_audit LIMIT 0');await db.query('SELECT trip_id,driver_id,event_type,created_at,read_at FROM dispatch_admin_notifications LIMIT 0');res.set('Cache-Control','no-store').status(200).json({service:'pimentel-dispatch',ready:true})}catch(e){res.set('Cache-Control','no-store').status(503).json({service:'pimentel-dispatch',ready:false})}});
app.use(session({store:new PgStore({pool:db,createTableIfMissing:true}),secret:process.env.DISPATCH_SESSION_SECRET,resave:false,saveUninitialized:false,name:'dispatch_sid',cookie:{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:28800000}}));
function checkAdminPassword(password){
 if(typeof password!=='string'||password.length>1024) return false;
 const [salt,hash]=adminPasswordHash.split(':');
 if(!/^[a-f0-9]{32}$/i.test(salt||'')||!/^[a-f0-9]{128}$/i.test(hash||'')) return false;
 return crypto.timingSafeEqual(crypto.scryptSync(password,salt,64),Buffer.from(hash,'hex'));
}
const rotateSession=req=>new Promise((resolve,reject)=>req.session.regenerate(e=>e?reject(e):resolve()));
const loginLimiter=rateLimit({windowMs:900000,limit:5,standardHeaders:'draft-7',legacyHeaders:false});
app.use('/auth/login',loginLimiter);
app.use('/auth',createLoginRouter({db,checkAdminPassword,rotateSession}));
const role=expected=>async(req,res,next)=>{try{if(!req.session?.userId||req.session.role!==expected)return res.sendStatus(403);if(expected==='driver'){const q=await db.query('SELECT id FROM dispatch_drivers WHERE id=$1 AND active=TRUE',[req.session.userId]);if(!q.rowCount)return res.sendStatus(403);req.driver={id:req.session.userId}}next()}catch(e){next(e)}};
if(process.env.BOOKING_INTAKE_STAGING_ENABLED==='true'){
 if(process.env.BOOKING_SCHEMA_STAGING_ENABLED!=='true')throw Error('Booking schema must be enabled');
 const {router}=require('./booking-staging-router');
 app.use('/booking-staging',router({db,secret:process.env.BOOKING_SERVICE_SECRET,requireAdmin:role('admin')}));
 app.get('/booking-admin',(req,res,next)=>{if(!req.session?.userId||req.session.role!=='admin')return res.redirect('/panel?open=bookings');next()},role('admin'),(req,res)=>res.sendFile(require('node:path').join(__dirname,'booking-admin.html')));
}
// Dedicated production intake; never permit staging intake and production intake together.
if(process.env.BOOKING_INTAKE_PRODUCTION_ENABLED==='true'){
 if(process.env.BOOKING_INTAKE_STAGING_ENABLED==='true'||process.env.BOOKING_SCHEMA_STAGING_ENABLED==='true')
  throw Error('Production and staging booking intake must be isolated');
 if(process.env.NODE_ENV!=='production')throw Error('Production intake requires NODE_ENV=production');
 if(process.env.BOOKING_SCHEMA_PRODUCTION_ENABLED!=='true')throw Error('Production booking schema must be enabled');
 const {router}=require('./booking-staging-router');
 app.use('/booking',router({db,secret:process.env.BOOKING_SERVICE_SECRET,requireAdmin:role('admin')}));
 app.get('/booking-admin',(req,res,next)=>{if(!req.session?.userId||req.session.role!=='admin')return res.redirect('/panel?open=bookings');next()},role('admin'),(req,res)=>res.sendFile(require('node:path').join(__dirname,'booking-admin.html')));
}
app.use('/dispatch',createDispatchRouter({db,requireAdmin:role('admin'),requireDriver:role('driver')}));
app.use((err,req,res,next)=>{console.error(err.code||err.name);res.status(500).json({error:'Server error'});});
async function startDispatch(){
 const fs=require('node:fs');
 const path=require('node:path');
 const schema=fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8');
 console.info('Dispatch startup: connecting to PostgreSQL');
 const client=await db.connect();
 console.info('Dispatch startup: PostgreSQL connected; initializing schema');
 try{
  await client.query('BEGIN');
  await client.query(schema);
  // Existing staging databases need this idempotent schema upgrade: CREATE TABLE IF NOT EXISTS does not add columns.
  await client.query('ALTER TABLE dispatch_trips ADD COLUMN IF NOT EXISTS on_my_way_at TIMESTAMPTZ');
  await client.query('ALTER TABLE dispatch_trips ADD COLUMN IF NOT EXISTS passenger_phone TEXT');
  // Production booking inbox uses the same additive schema, but only in an isolated database.
  if(process.env.BOOKING_SCHEMA_PRODUCTION_ENABLED==='true'){
   if(process.env.NODE_ENV!=='production'||process.env.BOOKING_SCHEMA_STAGING_ENABLED==='true')
    throw Error('Production booking schema isolation failed');
   const database=await client.query('SELECT current_database() AS name');
   const expectedName=process.env.DISPATCH_PRODUCTION_DATABASE_NAME;
   if(!expectedName||!/^[a-z][a-z0-9_]{3,62}$/.test(expectedName))
    throw Error('Explicit production database identity required');
   if(/dev|staging|test/i.test(database.rows[0].name)||database.rows[0].name!==expectedName)
    throw Error('Production dispatch database identity mismatch');
   await client.query(`CREATE TABLE IF NOT EXISTS booking_requests (
     id BIGSERIAL PRIMARY KEY, reference TEXT NOT NULL UNIQUE,
     passenger_name TEXT NOT NULL, passenger_phone TEXT NOT NULL,
     passenger_email TEXT NOT NULL, pickup_address TEXT NOT NULL,
     destination_address TEXT NOT NULL, pickup_local_date DATE NOT NULL,
     pickup_local_time TIME NOT NULL, passenger_count TEXT,
     service_tier TEXT NOT NULL CHECK(service_tier IN ('luxury','comfort')),
     fare_cents INTEGER NOT NULL CHECK(fare_cents>=0),
     tip_cents INTEGER NOT NULL DEFAULT 0 CHECK(tip_cents>=0),
     payment_preference TEXT NOT NULL CHECK(payment_preference IN ('later','coordinate')),
     special_instructions TEXT,
     status TEXT NOT NULL DEFAULT 'received'
       CHECK(status IN ('received','transferring','transferred','cancelled')),
     dispatch_trip_id BIGINT UNIQUE, transfer_attempts INTEGER NOT NULL DEFAULT 0,
     last_transfer_error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), transferred_at TIMESTAMPTZ)`);
   await client.query('CREATE INDEX IF NOT EXISTS booking_requests_inbox_idx ON booking_requests(status,created_at DESC)');
   await client.query('ALTER TABLE dispatch_trips ADD COLUMN IF NOT EXISTS booking_reference TEXT');
   await client.query('CREATE UNIQUE INDEX IF NOT EXISTS dispatch_trips_booking_reference_unique ON dispatch_trips(booking_reference) WHERE booking_reference IS NOT NULL');
  }
  // Additive staging integration schema. Never delete or rewrite existing trips.
  if(process.env.BOOKING_SCHEMA_STAGING_ENABLED==='true'){
   const database=await client.query('SELECT current_database() AS name');
   if(database.rows[0].name!=='pimentel_dispatch_dev')throw Error('Booking staging schema blocked: unexpected database');
   await client.query(`CREATE TABLE IF NOT EXISTS booking_requests (
     id BIGSERIAL PRIMARY KEY, reference TEXT NOT NULL UNIQUE,
     passenger_name TEXT NOT NULL, passenger_phone TEXT NOT NULL,
     passenger_email TEXT NOT NULL, pickup_address TEXT NOT NULL,
     destination_address TEXT NOT NULL, pickup_local_date DATE NOT NULL,
     pickup_local_time TIME NOT NULL, passenger_count TEXT,
     service_tier TEXT NOT NULL CHECK(service_tier IN ('luxury','comfort')),
     fare_cents INTEGER NOT NULL CHECK(fare_cents>=0),
     tip_cents INTEGER NOT NULL DEFAULT 0 CHECK(tip_cents>=0),
     payment_preference TEXT NOT NULL CHECK(payment_preference IN ('later','coordinate')),
     special_instructions TEXT,
     status TEXT NOT NULL DEFAULT 'received'
       CHECK(status IN ('received','transferring','transferred','cancelled')),
     dispatch_trip_id BIGINT UNIQUE, transfer_attempts INTEGER NOT NULL DEFAULT 0,
     last_transfer_error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), transferred_at TIMESTAMPTZ)`);
   await client.query('CREATE INDEX IF NOT EXISTS booking_requests_inbox_idx ON booking_requests(status,created_at DESC)');
   await client.query('ALTER TABLE dispatch_trips ADD COLUMN IF NOT EXISTS booking_reference TEXT');
   await client.query('CREATE UNIQUE INDEX IF NOT EXISTS dispatch_trips_booking_reference_unique ON dispatch_trips(booking_reference) WHERE booking_reference IS NOT NULL');
   console.info('Booking staging: additive schema checked');
  }
  await client.query('COMMIT');
  console.info('Dispatch startup: schema initialization complete');
 }catch(err){await client.query('ROLLBACK');throw err}
 finally{client.release()}
 app.listen(Number(process.env.PORT)||3100,()=>console.info('Dispatch startup: HTTP listener ready'));
}
if(require.main===module)startDispatch().catch(err=>{console.error('Dispatch database initialization failed:',err.code||err.name);process.exit(1)});
module.exports={app};

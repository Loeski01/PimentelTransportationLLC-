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
const db=new Pool({connectionString:process.env.DISPATCH_DATABASE_URL});
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
app.get('/ready',async(req,res)=>{try{await db.query('SELECT arrived_at FROM dispatch_trips LIMIT 0');await db.query('SELECT 1 FROM dispatch_drivers LIMIT 0');await db.query('SELECT 1 FROM dispatch_trip_audit LIMIT 0');res.set('Cache-Control','no-store').status(200).json({service:'pimentel-dispatch',ready:true})}catch(e){res.set('Cache-Control','no-store').status(503).json({service:'pimentel-dispatch',ready:false})}});
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
app.use('/dispatch',createDispatchRouter({db,requireAdmin:role('admin'),requireDriver:role('driver')}));
app.use((err,req,res,next)=>{console.error(err.code||err.name);res.status(500).json({error:'Server error'});});
async function startDispatch(){
 const fs=require('node:fs');
 const path=require('node:path');
 const schema=fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8');
 const client=await db.connect();
 try{
  await client.query('BEGIN');
  await client.query(schema);
  await client.query('COMMIT');
 }catch(err){await client.query('ROLLBACK');throw err}
 finally{client.release()}
 app.listen(Number(process.env.PORT)||3100);
}
if(require.main===module)startDispatch().catch(err=>{console.error('Dispatch database initialization failed:',err.code||err.name);process.exit(1)});
module.exports={app};

// Standalone dispatch service; not imported by the existing booking server.
const express=require('express'),crypto=require('node:crypto');
const {Pool}=require('pg'),session=require('express-session');
const PgStore=require('connect-pg-simple')(session);
const {rateLimit}=require('express-rate-limit');
const {createLoginRouter}=require('./login');
const {createDispatchRouter}=require('./router');
for(const k of ['DISPATCH_DATABASE_URL','DISPATCH_SESSION_SECRET','DISPATCH_ADMIN_PASSWORD_HASH']) if(!process.env[k]) throw Error('Missing '+k);
if(process.env.DISPATCH_SESSION_SECRET.length<32) throw Error('Session secret too short');
const db=new Pool({connectionString:process.env.DISPATCH_DATABASE_URL});
const app=express();
app.set('trust proxy',1);
app.use(express.json({limit:'16kb'}));
app.use(session({store:new PgStore({pool:db,createTableIfMissing:true}),secret:process.env.DISPATCH_SESSION_SECRET,resave:false,saveUninitialized:false,name:'dispatch_sid',cookie:{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:28800000}}));
function checkAdminPassword(password){
 if(typeof password!=='string'||password.length>1024) return false;
 const [salt,hash]=process.env.DISPATCH_ADMIN_PASSWORD_HASH.split(':');
 if(!/^[a-f0-9]{32}$/i.test(salt||'')||!/^[a-f0-9]{128}$/i.test(hash||'')) return false;
 return crypto.timingSafeEqual(crypto.scryptSync(password,salt,64),Buffer.from(hash,'hex'));
}
const rotateSession=req=>new Promise((resolve,reject)=>req.session.regenerate(e=>e?reject(e):resolve()));
app.use('/auth',rateLimit({windowMs:900000,limit:5,standardHeaders:'draft-7',legacyHeaders:false}),createLoginRouter({db,checkAdminPassword,rotateSession}));
const role=expected=>(req,res,next)=>{if(!req.session?.userId||req.session.role!==expected)return res.sendStatus(403);if(expected==='driver')req.driver={id:req.session.userId};next();};
app.use('/dispatch',createDispatchRouter({db,requireAdmin:role('admin'),requireDriver:role('driver')}));
app.use((err,req,res,next)=>{console.error(err.code||err.name);res.status(500).json({error:'Server error'});});
if(require.main===module)app.listen(Number(process.env.PORT)||3100);
module.exports={app};

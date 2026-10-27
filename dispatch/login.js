"use strict";
const express=require("express");
const crypto=require("node:crypto");
const {pool,hashToken,randomToken}=require("./router");
const router=express.Router();
// Login responses must never be cached, including failures.
router.use((req,res,next)=>{res.set("Cache-Control","no-store");res.set("Pragma","no-cache");next();});
const attempts=new Map();
const WINDOW=15*60*1000;
const MAX_TRACKED_IPS=10000;
function limited(ip){
 const now=Date.now();
 const key=String(ip||"unknown");
 const item=attempts.get(key);
 if(!item||now-item.start>WINDOW){
  // Keep the in-memory limiter bounded under high-cardinality traffic.
  if(!item&&attempts.size>=MAX_TRACKED_IPS){
   for(const [address,entry] of attempts){if(now-entry.start>WINDOW)attempts.delete(address);}
   if(attempts.size>=MAX_TRACKED_IPS)return true;
  }
  attempts.set(key,{start:now,count:1});return false;
 }
 item.count++;return item.count>8;
}
setInterval(()=>{const now=Date.now();for(const [ip,item] of attempts){if(now-item.start>WINDOW)attempts.delete(ip);}},WINDOW).unref();
router.post("/login",async(req,res)=>{
 try{
 if(limited(req.ip))return res.status(429).json({error:"Demasiados intentos. Espera 15 minutos."});
 const {email,password}=req.body||{};
 if(typeof email!=="string"||typeof password!=="string"||email.length>254||password.length<1||password.length>128)return res.status(400).json({error:"Datos inválidos"});
 const r=await pool.query("SELECT id,password_hash FROM drivers WHERE email=$1 AND active=true",[email.trim().toLowerCase()]);
 // Perform the same expensive password verification even for unknown accounts.
 // This reduces account enumeration through response timing.
 const dummyHash="00000000000000000000000000000000:"+("00".repeat(64));
 const [salt,expected]=(r.rows[0]?.password_hash||dummyHash).split(":");
 const key=await new Promise((resolve,reject)=>crypto.scrypt(password,salt,64,(err,v)=>err?reject(err):resolve(v)));
 const a=Buffer.from(expected,"hex");if(a.length!==key.length||!crypto.timingSafeEqual(a,key)||!r.rowCount)return res.status(401).json({error:"Credenciales incorrectas"});
 const token=randomToken();
 await pool.query("INSERT INTO driver_sessions(driver_id,token_hash,expires_at) VALUES($1,$2,now()+interval '12 hours')",[r.rows[0].id,hashToken(token)]);
 res.set("Cache-Control","no-store").set("Pragma","no-cache").json({token,expiresInSeconds:43200});
 }catch(e){console.error("Login error",e.code||e.message);res.status(500).json({error:"No se pudo iniciar sesión"});}
});
module.exports=router;

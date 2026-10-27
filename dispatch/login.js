"use strict";
const express=require("express");
const crypto=require("node:crypto");
const {pool,hashToken,randomToken}=require("./router");
const router=express.Router();
const attempts=new Map();
const WINDOW=15*60*1000;
function limited(ip){const now=Date.now();const item=attempts.get(ip);if(!item||now-item.start>WINDOW){attempts.set(ip,{start:now,count:1});return false;}item.count++;return item.count>8;}
setInterval(()=>{const now=Date.now();for(const [ip,item] of attempts){if(now-item.start>WINDOW)attempts.delete(ip);}},WINDOW).unref();
router.post("/login",async(req,res)=>{
 try{
 if(limited(req.ip))return res.status(429).json({error:"Demasiados intentos. Espera 15 minutos."});
 const {email,password}=req.body||{};
 if(typeof email!=="string"||typeof password!=="string"||email.length>254||password.length>128)return res.status(400).json({error:"Datos inválidos"});
 const r=await pool.query("SELECT id,password_hash FROM drivers WHERE email=$1 AND active=true",[email.toLowerCase()]);
 if(!r.rowCount)return res.status(401).json({error:"Credenciales incorrectas"});
 const [salt,expected]=r.rows[0].password_hash.split(":");
 const key=await new Promise((resolve,reject)=>crypto.scrypt(password,salt,64,(err,v)=>err?reject(err):resolve(v)));
 const a=Buffer.from(expected,"hex");if(a.length!==key.length||!crypto.timingSafeEqual(a,key))return res.status(401).json({error:"Credenciales incorrectas"});
 const token=randomToken();
 await pool.query("INSERT INTO driver_sessions(driver_id,token_hash,expires_at) VALUES($1,$2,now()+interval '12 hours')",[r.rows[0].id,hashToken(token)]);
 res.set("Cache-Control","no-store").json({token,expiresInSeconds:43200});
 }catch(e){console.error("Login error",e.code||e.message);res.status(500).json({error:"No se pudo iniciar sesión"});}
});
module.exports=router;

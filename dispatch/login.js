"use strict";
const express=require("express");
const crypto=require("node:crypto");
const {pool,hashToken,randomToken}=require("./router");
const {validPin,driverLimiter}=require("./driver-pin-policy");
const router=express.Router();
router.use((req,res,next)=>{res.set("Cache-Control","no-store");res.set("Pragma","no-cache");next();});
router.post("/login",async(req,res)=>{
 let client;
 try{
  if(!driverLimiter.allowTraffic(req.ip))return res.status(429).json({error:"Demasiados intentos. Espera 15 minutos."});
  const {email,password}=req.body||{};
  if(typeof email!=="string"||email.length>254||!email.trim()||!validPin(password))return res.status(400).json({error:"Escribe tu correo y un PIN de exactamente 4 dígitos."});
  const normalized=email.trim().toLowerCase();
  if(driverLimiter.blocked(normalized))return res.status(429).json({error:"Demasiados intentos. Espera 15 minutos o contacta al administrador."});
  client=await pool.connect();await client.query("BEGIN");
  const result=await client.query("SELECT id,password_hash,pin_locked_until FROM drivers WHERE email=$1 AND active=true AND pin_configured=true FOR UPDATE",[normalized]);
  const driver=result.rows[0];
  if(driver?.pin_locked_until&&new Date(driver.pin_locked_until).getTime()>Date.now()){
   await client.query("ROLLBACK");return res.status(429).json({error:"Demasiados intentos. Espera 15 minutos o contacta al administrador."});
  }
  const dummy="00000000000000000000000000000000:"+"00".repeat(64);
  const [salt,expected]=(driver?.password_hash||dummy).split(":");
  const key=await new Promise((resolve,reject)=>crypto.scrypt(password,salt,64,(error,value)=>error?reject(error):resolve(value)));
  const stored=Buffer.from(expected,"hex");
  if(!driver||stored.length!==key.length||!crypto.timingSafeEqual(stored,key)){
   driverLimiter.failed(normalized);
   if(driver)await client.query("UPDATE drivers SET failed_pin_attempts=CASE WHEN pin_locked_until<=now() THEN 1 ELSE failed_pin_attempts+1 END,pin_locked_until=CASE WHEN (CASE WHEN pin_locked_until<=now() THEN 1 ELSE failed_pin_attempts+1 END)>=5 THEN now()+interval '15 minutes' ELSE NULL END WHERE id=$1",[driver.id]);
   await client.query("COMMIT");return res.status(401).json({error:"Correo o PIN incorrecto."});
  }
  await client.query("UPDATE drivers SET failed_pin_attempts=0,pin_locked_until=NULL WHERE id=$1",[driver.id]);
  const token=randomToken();
  await client.query("INSERT INTO driver_sessions(driver_id,token_hash,expires_at) VALUES($1,$2,now()+interval '12 hours')",[driver.id,hashToken(token)]);
  await client.query("COMMIT");driverLimiter.clear(normalized);
  res.json({token,expiresInSeconds:43200});
 }catch(error){if(client)await client.query("ROLLBACK").catch(()=>{});console.error("Driver login failed",error.code||"LOGIN_FAILED");res.status(503).json({error:"No se pudo iniciar sesión"});}
 finally{client?.release();}
});
module.exports=router;

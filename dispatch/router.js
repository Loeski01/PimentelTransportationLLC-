"use strict";
// Dispatch router: mount only after DATABASE_URL and DISPATCH_ADMIN_TOKEN are configured.
// PostgreSQL required. Never expose administrator token in browser source.
const express = require("express");
const crypto = require("node:crypto");
const { Pool } = require("pg");
const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: true } : false });
const hashToken = token => crypto.createHash("sha256").update(token).digest("hex");
const safeEqual = (a,b) => { const x=Buffer.from(a||""),y=Buffer.from(b||""); return x.length===y.length && crypto.timingSafeEqual(x,y); };
const randomToken = () => crypto.randomBytes(32).toString("hex");
const validEmail = s => typeof s==="string" && s.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const fail = (res,code,message) => res.status(code).json({error:message});
const wrap = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
async function auth(req,res,next) {
  const token = /^Bearer (.+)$/i.exec(req.get("authorization")||"")?.[1];
  if (!token) return fail(res,401,"Se requiere iniciar sesión");
  if (process.env.DISPATCH_ADMIN_TOKEN && safeEqual(token,process.env.DISPATCH_ADMIN_TOKEN)) {
    req.actor={role:"admin",id:"admin"};return next();
  }
  const result=await pool.query("SELECT s.driver_id,d.active FROM driver_sessions s JOIN drivers d ON d.id=s.driver_id WHERE s.token_hash=$1 AND s.expires_at>now()",[hashToken(token)]);
  if (!result.rows[0]?.active) return fail(res,401,"Sesión inválida");
  req.actor={role:"driver",id:result.rows[0].driver_id};next();
}
router.use(wrap(auth));
const admin=(req,res,next)=>req.actor.role==="admin"?next():fail(res,403,"Acceso exclusivo del administrador");
router.post("/drivers",admin,wrap(async(req,res)=>{
  const {name,email,phone,vehicle,password}=req.body||{};
  if(typeof name!=="string"||!name.trim()||name.length>120||!validEmail(email)||typeof phone!=="string"||!phone.trim()||phone.length>40||typeof password!=="string"||password.length<12||password.length>128||typeof vehicle!=="string"||vehicle.length>160)return fail(res,400,"Datos de conductor inválidos; contraseña mínimo 12 caracteres");
  const salt=crypto.randomBytes(16).toString("hex");
  const key=await new Promise((resolve,reject)=>crypto.scrypt(password,salt,64,(err,v)=>err?reject(err):resolve(v)));
  const saved=await pool.query("INSERT INTO drivers(name,email,phone,vehicle,password_hash) VALUES($1,$2,$3,$4,$5) RETURNING id,name,email,phone,vehicle,active",[name.trim(),email.toLowerCase(),phone.trim(),vehicle.trim(),salt+":"+key.toString("hex")]);
  res.status(201).json(saved.rows[0]);
}));
router.get("/drivers",admin,wrap(async(req,res)=>{
  const r=await pool.query("SELECT id,name,email,phone,vehicle,active,created_at FROM drivers ORDER BY created_at DESC");res.json(r.rows);
}));
router.patch("/drivers/:id",admin,wrap(async(req,res)=>{
  if(typeof req.body?.active!=="boolean")return fail(res,400,"active debe ser booleano");
  const r=await pool.query("UPDATE drivers SET active=$1 WHERE id=$2 RETURNING id,name,active",[req.body.active,req.params.id]);if(!r.rowCount)return fail(res,404,"Conductor no encontrado");
  if(!req.body.active)await pool.query("DELETE FROM driver_sessions WHERE driver_id=$1",[req.params.id]);
  res.json(r.rows[0]);
}));
router.get("/bookings",admin,wrap(async(req,res)=>{
  const r=await pool.query("SELECT id,reference,customer_name,pickup,destination,pickup_at,estimated_fare_cents,status FROM bookings ORDER BY pickup_at DESC LIMIT 200");res.json(r.rows);
}));
router.post("/bookings/:id/approve",admin,wrap(async(req,res)=>{
  const r=await pool.query("UPDATE bookings SET status='approved' WHERE id=$1 AND status='pending' RETURNING id,status",[req.params.id]);if(!r.rowCount)return fail(res,409,"Reserva inexistente o no pendiente");res.json(r.rows[0]);
}));
router.post("/bookings/:id/assign",admin,wrap(async(req,res)=>{
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const b=await client.query("SELECT id,status FROM bookings WHERE id=$1 FOR UPDATE",[req.params.id]);
    if(!b.rowCount||b.rows[0].status!=="approved"){await client.query("ROLLBACK");return fail(res,409,"La reserva debe estar aprobada y sin asignar");}
    const d=await client.query("SELECT id FROM drivers WHERE id=$1 AND active=true",[req.body?.driverId]);
    if(!d.rowCount){await client.query("ROLLBACK");return fail(res,404,"Conductor no disponible");}
    const a=await client.query("INSERT INTO assignments(booking_id,driver_id) VALUES($1,$2) RETURNING id,status",[req.params.id,req.body.driverId]);
    await client.query("UPDATE bookings SET status='assigned' WHERE id=$1",[req.params.id]);
    await client.query("INSERT INTO dispatch_audit(booking_id,actor_role,actor_id,action) VALUES($1,'admin','admin','assigned')",[req.params.id]);
    await client.query("COMMIT");res.status(201).json(a.rows[0]);
  }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}));
router.get("/my-assignments",wrap(async(req,res)=>{
  if(req.actor.role!=="driver")return fail(res,403,"Acceso de conductor");
  const r=await pool.query("SELECT a.id,a.status,b.reference,b.pickup,b.destination,b.pickup_at FROM assignments a JOIN bookings b ON b.id=a.booking_id WHERE a.driver_id=$1 ORDER BY b.pickup_at DESC LIMIT 100",[req.actor.id]);res.json(r.rows);
}));
router.post("/my-assignments/:id/respond",wrap(async(req,res)=>{
  if(req.actor.role!=="driver")return fail(res,403,"Acceso de conductor");
  if(!["accepted","rejected"].includes(req.body?.status))return fail(res,400,"Estado inválido");
  const r=await pool.query("UPDATE assignments SET status=$1,responded_at=now() WHERE id=$2 AND driver_id=$3 AND status='offered' RETURNING id,status",[req.body.status,req.params.id,req.actor.id]);
  if(!r.rowCount)return fail(res,409,"Asignación no disponible");res.json(r.rows[0]);
}));
router.use((err,req,res,next)=>{console.error("Dispatch error",err.code||err.message);res.status(err.code==="23505"?409:500).json({error:"No se pudo completar la operación"});});
module.exports={router,pool,hashToken,randomToken};

"use strict";
// Dispatch router: mount behind administrator cookie authentication or driver sessions.
// PostgreSQL required. Never expose administrator token in browser source.
const express = require("express");
const crypto = require("node:crypto");
const {validPin,driverLimiter}=require("./driver-pin-policy");
const {enqueueNotification}=require("./notifications");
const { Pool } = require("pg");
const router = express.Router();
// Never cache authenticated driver or administrator API responses.
router.use((req,res,next)=>{res.set("Cache-Control","no-store");res.set("Pragma","no-cache");next();});
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: true } : false });
const hashToken = token => crypto.createHash("sha256").update(token).digest("hex");
const randomToken = () => crypto.randomBytes(32).toString("hex");
const validEmail = s => typeof s==="string" && s.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const fail = (res,code,message) => res.status(code).json({error:message});
const wrap = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
async function auth(req,res,next) {
  if (req.actor?.role === "admin") return next();
  const token = /^Bearer (.+)$/i.exec(req.get("authorization")||"")?.[1];
  if (!token) return fail(res,401,"Se requiere iniciar sesión");
  const result=await pool.query("SELECT s.driver_id,(d.active AND d.pin_configured) AS active FROM driver_sessions s JOIN drivers d ON d.id=s.driver_id WHERE s.token_hash=$1 AND s.expires_at>now()",[hashToken(token)]);
  if (!result.rows[0]?.active) return fail(res,401,"Sesión inválida");
  req.actor={role:"driver",id:result.rows[0].driver_id};next();
}
router.use(wrap(auth));
const admin=(req,res,next)=>req.actor.role==="admin"?next():fail(res,403,"Acceso exclusivo del administrador");
router.post("/drivers",admin,wrap(async(req,res)=>{
  const {name,email,phone,vehicle,password}=req.body||{};
  if(typeof name!=="string"||!name.trim()||name.length>120||!validEmail(email)||typeof phone!=="string"||!phone.trim()||phone.length>40||!validPin(password)||typeof vehicle!=="string"||vehicle.length>160)return fail(res,400,"Datos de conductor inválidos; el PIN debe tener exactamente 4 dígitos");
  const salt=crypto.randomBytes(16).toString("hex");
  const key=await new Promise((resolve,reject)=>crypto.scrypt(password,salt,64,(err,v)=>err?reject(err):resolve(v)));
  const saved=await pool.query("INSERT INTO drivers(name,email,phone,vehicle,password_hash,pin_configured) VALUES($1,$2,$3,$4,$5,true) RETURNING id,name,email,phone,vehicle,active",[name.trim(),email.trim().toLowerCase(),phone.trim(),vehicle.trim(),salt+":"+key.toString("hex")]);
  res.status(201).json(saved.rows[0]);
}));
router.get("/drivers",admin,wrap(async(req,res)=>{
  const r=await pool.query("SELECT id,name,email,phone,vehicle,active,pin_configured,created_at FROM drivers ORDER BY created_at DESC");res.json(r.rows);
}));
router.patch("/drivers/:id",admin,wrap(async(req,res)=>{
  if(typeof req.body?.active!=="boolean")return fail(res,400,"active debe ser booleano");
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    const r=await client.query("UPDATE drivers SET active=$1 WHERE id=$2 RETURNING id,name,active",[req.body.active,req.params.id]);
    if(!r.rowCount){await client.query("ROLLBACK");return fail(res,404,"Conductor no encontrado");}
    if(!req.body.active)await client.query("DELETE FROM driver_sessions WHERE driver_id=$1",[req.params.id]);
    await client.query("COMMIT");res.json(r.rows[0]);
  }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}));
router.post("/drivers/:id/password",admin,wrap(async(req,res)=>{
  const password=req.body?.password;
  if(!validPin(password))return fail(res,400,"El PIN debe tener exactamente 4 dígitos");
  const salt=crypto.randomBytes(16).toString("hex");
  const key=await new Promise((resolve,reject)=>crypto.scrypt(password,salt,64,(err,value)=>err?reject(err):resolve(value)));
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const changed=await client.query("UPDATE drivers SET password_hash=$1,pin_configured=true,failed_pin_attempts=0,pin_locked_until=NULL WHERE id=$2 RETURNING id,email",[salt+":"+key.toString("hex"),req.params.id]);
    if(!changed.rowCount){await client.query("ROLLBACK");return fail(res,404,"Conductor no encontrado");}
    await client.query("DELETE FROM driver_sessions WHERE driver_id=$1",[req.params.id]);
    await client.query("INSERT INTO dispatch_audit(actor_role,actor_id,action) VALUES('admin','admin',$1)",["driver_pin_reset:"+req.params.id]);
    await client.query("COMMIT");driverLimiter.clear(changed.rows[0].email);res.json({ok:true});
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}));
router.post("/bookings",admin,wrap(async(req,res)=>{
  const b=req.body||{};
  const good=(v,n)=>typeof v==="string"&&v.trim().length>0&&v.trim().length<=n;
  const date=typeof b.pickupAt==="string"?new Date(b.pickupAt):new Date(NaN);
  if(!good(b.customerName,120)||!validEmail(b.customerEmail)||!good(b.customerPhone,40)||!good(b.pickup,1000)||!good(b.destination,1000)||!Number.isFinite(date.getTime())||!Number.isSafeInteger(b.estimatedFareCents)||b.estimatedFareCents<0||b.estimatedFareCents>100000000)return fail(res,400,"Datos de viaje inválidos");
  const ref="DSP-"+crypto.randomBytes(8).toString("hex").toUpperCase();
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    const q=await client.query("INSERT INTO bookings(reference,customer_name,customer_email,customer_phone,pickup,destination,pickup_at,estimated_fare_cents) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,reference,status",[
      ref,b.customerName.trim(),b.customerEmail.trim().toLowerCase(),b.customerPhone.trim(),b.pickup.trim(),b.destination.trim(),date.toISOString(),b.estimatedFareCents
    ]);
    await client.query("INSERT INTO dispatch_audit(booking_id,actor_role,actor_id,action) VALUES($1,'admin','admin','created')",[q.rows[0].id]);
    await client.query("COMMIT");
    res.status(201).json(q.rows[0]);
  }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}));
router.get("/bookings",admin,wrap(async(req,res)=>{
  const extra=process.env.ENABLE_DISPATCH_BOOKING_INTAKE==="true"?",request_metadata":"";
  const r=await pool.query("SELECT id,reference,customer_name,customer_email,customer_phone,pickup,destination,pickup_at,estimated_fare_cents,status"+extra+" FROM bookings ORDER BY pickup_at DESC LIMIT 200");res.json(r.rows);
}));
router.post("/bookings/:id/approve",admin,wrap(async(req,res)=>{
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    const r=await client.query("UPDATE bookings SET status='approved' WHERE id=$1 AND status='pending' RETURNING id,status",[req.params.id]);
    if(!r.rowCount){await client.query("ROLLBACK");return fail(res,409,"Reserva inexistente o no pendiente");}
    await client.query("INSERT INTO dispatch_audit(booking_id,actor_role,actor_id,action) VALUES($1,'admin','admin','approved')",[req.params.id]);
    await client.query("COMMIT");res.json(r.rows[0]);
  }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}));
router.post("/bookings/:id/assign",admin,wrap(async(req,res)=>{
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const b=await client.query("SELECT id,status FROM bookings WHERE id=$1 FOR UPDATE",[req.params.id]);
    if(!b.rowCount||b.rows[0].status!=="approved"){await client.query("ROLLBACK");return fail(res,409,"La reserva debe estar aprobada y sin asignar");}
    const d=await client.query("SELECT id FROM drivers WHERE id=$1 AND active=true AND pin_configured=true FOR SHARE",[req.body?.driverId]);
    if(!d.rowCount){await client.query("ROLLBACK");return fail(res,404,"Conductor no disponible");}
    const a=await client.query("INSERT INTO assignments(booking_id,driver_id) VALUES($1,$2) RETURNING id,status",[req.params.id,req.body.driverId]);
    await client.query("UPDATE bookings SET status='assigned' WHERE id=$1",[req.params.id]);
    await client.query("INSERT INTO dispatch_audit(booking_id,actor_role,actor_id,action) VALUES($1,'admin','admin','assigned')",[req.params.id]);
    await enqueueNotification(client,{bookingId:req.params.id,assignmentId:a.rows[0].id,kind:"driver_offer",enabled:process.env.ENABLE_DISPATCH_EMAIL_NOTIFICATIONS==="true"});
    await client.query("COMMIT");res.status(201).json(a.rows[0]);
  }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}));
// All operations that change a booking lock it before its assignments.
router.post("/bookings/:id/:action(release|cancel)",admin,wrap(async(req,res)=>{
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const b=await client.query("SELECT id,status FROM bookings WHERE id=$1 FOR UPDATE",[req.params.id]);
    const allowed=req.params.action==="release"?["assigned"]:["pending","approved","assigned"];
    if(!b.rowCount||!allowed.includes(b.rows[0].status)){await client.query("ROLLBACK");return fail(res,409,"El viaje no permite esta acción; revisa su estado");}
    await client.query("UPDATE assignments SET status='revoked',responded_at=now() WHERE booking_id=$1 AND status IN ('offered','accepted')",[req.params.id]);
    const status=req.params.action==="release"?"approved":"cancelled";
    await client.query("UPDATE bookings SET status=$1 WHERE id=$2",[status,req.params.id]);
    await client.query("INSERT INTO dispatch_audit(booking_id,actor_role,actor_id,action) VALUES($1,'admin','admin',$2)",[req.params.id,req.params.action==="release"?"assignment_released":"cancelled"]);
    await client.query("COMMIT");res.json({id:req.params.id,status});
  }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}));
async function lockAssignment(client,id,driverId){
  const found=await client.query("SELECT booking_id FROM assignments WHERE id=$1 AND driver_id=$2",[id,driverId]);
  if(!found.rowCount)return {rowCount:0,rows:[]};
  await client.query("SELECT id FROM bookings WHERE id=$1 FOR UPDATE",[found.rows[0].booking_id]);
  return client.query("SELECT id,booking_id,status FROM assignments WHERE id=$1 AND driver_id=$2 FOR UPDATE",[id,driverId]);
}
router.get("/notifications",admin,wrap(async(req,res)=>{
 const result=await pool.query("SELECT n.id,n.kind,n.status,n.attempts,n.last_error_code,n.created_at,b.reference FROM dispatch_notifications n JOIN bookings b ON b.id=n.booking_id ORDER BY n.created_at DESC LIMIT 50");res.json({enabled:process.env.ENABLE_DISPATCH_EMAIL_NOTIFICATIONS==="true",rows:result.rows});
}));
router.post("/notifications/:id/retry",admin,wrap(async(req,res)=>{
 if(process.env.ENABLE_DISPATCH_EMAIL_NOTIFICATIONS!=="true")return fail(res,409,"Los avisos por correo están desactivados en pruebas");
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const result=await client.query("UPDATE dispatch_notifications SET status='pending',attempts=0,next_attempt_at=now(),last_error_code=NULL WHERE id=$1 AND status='failed' AND (last_error_code<>'DELIVERY_UNKNOWN' OR $2=true) RETURNING id,booking_id",[req.params.id,req.body?.confirmDeliveryReview===true]);
  if(!result.rowCount){await client.query("ROLLBACK");return fail(res,409,"Revisa si el proveedor ya envió el aviso antes de reintentarlo");}
  await client.query("INSERT INTO dispatch_audit(booking_id,actor_role,actor_id,action) VALUES($1,'admin','admin','notification_retry')",[result.rows[0].booking_id]);
  await client.query("COMMIT");res.json({ok:true});
 }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}));
router.post("/logout",wrap(async(req,res)=>{
  if(req.actor.role!=="driver")return fail(res,403,"Acceso de conductor");
  const token=/^Bearer (.+)$/i.exec(req.get("authorization")||"")?.[1];
  await pool.query("DELETE FROM driver_sessions WHERE token_hash=$1 AND driver_id=$2",[hashToken(token),req.actor.id]);
  res.set("Cache-Control","no-store").json({ok:true});
}));
router.get("/my-assignments",wrap(async(req,res)=>{
  if(req.actor.role!=="driver")return fail(res,403,"Acceso de conductor");
  const metadata=process.env.ENABLE_DISPATCH_BOOKING_INTAKE==="true"?",CASE WHEN a.status='accepted' THEN b.request_metadata->>'details' END AS details,CASE WHEN a.status='accepted' THEN b.request_metadata->>'passengers' END AS passengers":"";
  const r=await pool.query("SELECT a.id,a.status,b.status AS booking_status,b.reference,b.pickup,b.destination,b.pickup_at,CASE WHEN a.status='accepted' THEN b.customer_name END AS customer_name,CASE WHEN a.status='accepted' THEN b.customer_phone END AS customer_phone"+metadata+" FROM assignments a JOIN bookings b ON b.id=a.booking_id WHERE a.driver_id=$1 ORDER BY b.pickup_at DESC LIMIT 100",[req.actor.id]);res.json(r.rows);
}));
router.post("/my-assignments/:id/respond",wrap(async(req,res)=>{
  if(req.actor.role!=="driver")return fail(res,403,"Acceso de conductor");
  if(!["accepted","rejected"].includes(req.body?.status))return fail(res,400,"Estado inválido");
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    const locked=await lockAssignment(client,req.params.id,req.actor.id);
    if(!locked.rowCount||locked.rows[0].status!=="offered"){await client.query("ROLLBACK");return fail(res,409,"Asignación no disponible");}
    const r=await client.query("UPDATE assignments SET status=$1,responded_at=now() WHERE id=$2 AND driver_id=$3 AND status='offered' RETURNING id,booking_id,status",[req.body.status,req.params.id,req.actor.id]);
    if(!r.rowCount){await client.query("ROLLBACK");return fail(res,409,"Asignación no disponible");}
    if(req.body.status==="rejected"){
      await client.query("UPDATE bookings SET status='approved' WHERE id=$1 AND status='assigned'",[r.rows[0].booking_id]);
    }
    await client.query("INSERT INTO dispatch_audit(booking_id,actor_role,actor_id,action) VALUES($1,'driver',$2,$3)",[r.rows[0].booking_id,String(req.actor.id),req.body.status]);
    await client.query("COMMIT");
    res.json({id:r.rows[0].id,status:r.rows[0].status});
  } catch(e){await client.query("ROLLBACK");throw e;} finally {client.release();}

}));
// Starting a trip requires an accepted assignment belonging to this driver.
router.post("/my-assignments/:id/start",wrap(async(req,res)=>{
  if(req.actor.role!=="driver")return fail(res,403,"Acceso de conductor");
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const a=await lockAssignment(client,req.params.id,req.actor.id);
    if(!a.rowCount||a.rows[0].status!=="accepted"){await client.query("ROLLBACK");return fail(res,409,"Primero debes aceptar este viaje");}
    const b=await client.query("UPDATE bookings SET status='in_progress' WHERE id=$1 AND status='assigned' RETURNING id",[a.rows[0].booking_id]);
    if(!b.rowCount){await client.query("ROLLBACK");return fail(res,409,"El viaje ya se inició o no está disponible");}
    await client.query("INSERT INTO dispatch_audit(booking_id,actor_role,actor_id,action) VALUES($1,'driver',$2,'started')",[a.rows[0].booking_id,String(req.actor.id)]);
    await client.query("COMMIT");res.json({id:a.rows[0].id,status:"in_progress"});
  }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}));
// A driver can finish only a trip they personally accepted.
router.post("/my-assignments/:id/complete",wrap(async(req,res)=>{
  if(req.actor.role!=="driver")return fail(res,403,"Acceso de conductor");
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    const a=await lockAssignment(client,req.params.id,req.actor.id);
    if(!a.rowCount||a.rows[0].status!=="accepted"){await client.query("ROLLBACK");return fail(res,409,"Solo puedes completar un viaje aceptado por ti");}
    const b=await client.query("UPDATE bookings SET status='completed' WHERE id=$1 AND status='in_progress' RETURNING id",[a.rows[0].booking_id]);
    if(!b.rowCount){await client.query("ROLLBACK");return fail(res,409,"Debes iniciar el viaje antes de completarlo");}
    await client.query("UPDATE assignments SET status='completed' WHERE id=$1",[req.params.id]);
    await client.query("INSERT INTO dispatch_audit(booking_id,actor_role,actor_id,action) VALUES($1,'driver',$2,'completed')",[a.rows[0].booking_id,String(req.actor.id)]);
    await client.query("COMMIT");
    res.json({id:a.rows[0].id,status:"completed"});
  }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}));
router.use((err,req,res,next)=>{console.error("Dispatch error",err.code||err.message);res.status(err.code==="23505"?409:500).json({error:"No se pudo completar la operación"});});
module.exports={router,pool,hashToken,randomToken};


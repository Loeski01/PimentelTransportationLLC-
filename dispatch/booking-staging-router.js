'use strict';
const express=require('express'),crypto=require('node:crypto');
function router({db,secret,requireAdmin}){
 if(typeof secret!=='string'||Buffer.byteLength(secret)<32)throw Error('Staging booking intake secret missing');
 const r=express.Router();
 const auth=(req,res,next)=>{
  const supplied=req.get('X-Booking-Service-Key')||'';
  const a=crypto.createHash('sha256').update(supplied).digest();
  const b=crypto.createHash('sha256').update(secret).digest();
  if(!supplied||!crypto.timingSafeEqual(a,b))return res.sendStatus(403);
  next();
 };
 r.post('/intake',auth,async(req,res,next)=>{
  const b=req.body||{};
  if(!/^PT-[A-Z0-9-]{4,64}$/.test(b.reference||'')||
   !['luxury','comfort'].includes(b.tier)||!['later','coordinate'].includes(b.payment)||
   !/^\d{4}-\d{2}-\d{2}$/.test(b.date||'')||!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.time||'')||
   ![b.name,b.phone,b.email,b.from,b.to].every(x=>typeof x==='string'&&x.trim()&&x.length<=254)||
   !Number.isSafeInteger(b.fareCents)||b.fareCents<0||!Number.isSafeInteger(b.tipCents)||b.tipCents<0)
   return res.status(400).json({error:'Invalid booking'});
  try{
   const q=await db.query(`INSERT INTO booking_requests
    (reference,passenger_name,passenger_phone,passenger_email,pickup_address,destination_address,
     pickup_local_date,pickup_local_time,passenger_count,service_tier,fare_cents,tip_cents,
     payment_preference,special_instructions)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    ON CONFLICT(reference) DO NOTHING RETURNING reference`,
    [b.reference,b.name,b.phone,b.email,b.from,b.to,b.date,b.time,b.passengers||null,b.tier,b.fareCents,b.tipCents,b.payment,b.details||null]);
   res.status(q.rowCount?201:200).json({stored:true,reference:b.reference});
  }catch(e){next(e)}
 });
 r.get('/inbox',requireAdmin,async(req,res,next)=>{
  try{const q=await db.query(`SELECT reference,passenger_name,pickup_address,destination_address,
   pickup_local_date::text AS pickup_local_date,pickup_local_time::text AS pickup_local_time,
   service_tier,fare_cents,status,dispatch_trip_id FROM booking_requests
   ORDER BY created_at DESC LIMIT 100`);
   res.set('Cache-Control','no-store').json(q.rows)
  }catch(e){next(e)}
 });
 r.post('/:reference/send-to-dispatch',requireAdmin,async(req,res,next)=>{
  const ref=req.params.reference;
  if(!/^PT-[A-Z0-9-]{4,64}$/.test(ref))return res.sendStatus(400);
  const client=await db.connect();
  try{
   await client.query('BEGIN');
   const q=await client.query('SELECT * FROM booking_requests WHERE reference=$1 FOR UPDATE',[ref]);
   if(!q.rowCount){await client.query('ROLLBACK');return res.sendStatus(404)}
   const b=q.rows[0];
   if(b.status==='transferred'){await client.query('COMMIT');return res.json({status:'transferred',id:b.dispatch_trip_id})}
   if(b.status!=='received'){await client.query('ROLLBACK');return res.status(409).json({error:'Not transferable'})}
   const localDate=b.pickup_local_date instanceof Date?b.pickup_local_date.toISOString().slice(0,10):String(b.pickup_local_date).slice(0,10);
   const localTime=String(b.pickup_local_time).slice(0,8);
   const dt=new Date(localDate+'T'+localTime+'-05:00');
   if(!Number.isFinite(dt.getTime()))throw Error('Invalid pickup time');
   const surname=b.passenger_name.trim().split(/\s+/).slice(-1)[0];
   const inserted=await client.query(`INSERT INTO dispatch_trips
    (booking_reference,passenger_surname,passenger_phone,pickup_address,destination_address,pickup_at,fare_cents,status)
    VALUES($1,$2,$3,$4,$5,$6,$7,'pending')
    ON CONFLICT(booking_reference) WHERE booking_reference IS NOT NULL DO NOTHING RETURNING id,status`,
    [ref,surname,b.passenger_phone,b.pickup_address,b.destination_address,dt.toISOString(),b.fare_cents]);
   const trip=inserted.rowCount?inserted.rows[0]:(await client.query('SELECT id,status FROM dispatch_trips WHERE booking_reference=$1',[ref])).rows[0];
   if(!trip)throw Error('Transfer unresolved');
   if(inserted.rowCount)await client.query(`INSERT INTO dispatch_trip_audit(trip_id,actor_role,actor_id,action)
    VALUES($1,'admin',$2,'created_from_booking')`,[trip.id,String(req.session.userId)]);
   await client.query(`UPDATE booking_requests SET status='transferred',dispatch_trip_id=$2,transferred_at=NOW(),updated_at=NOW()
    WHERE reference=$1`,[ref,trip.id]);
   await client.query('COMMIT');
   res.json({status:'transferred',id:trip.id});
  }catch(e){await client.query('ROLLBACK').catch(()=>{});next(e)}finally{client.release()}
 });
 return r;
}
module.exports={router};

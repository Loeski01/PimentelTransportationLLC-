'use strict';
const express=require('express'),crypto=require('node:crypto');
function bostonPickupTime(localDate,localTime){
  // Resolve Boston wall-clock time using America/New_York, including daylight saving.
  // Reject nonexistent spring-forward times rather than silently shifting a pickup.
  const parts=/^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  const clock=/^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(localTime);
  if(!parts||!clock)throw RangeError('Invalid pickup time');
  const y=Number(parts[1]),m=Number(parts[2]),d=Number(parts[3]);
  const hh=Number(clock[1]),mm=Number(clock[2]),ss=Number(clock[3]||0);
  const wall=Date.UTC(y,m-1,d,hh,mm,ss);
  const fmt=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hourCycle:'h23',
    year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const matches=[];
  for(const hours of [4,5]){
    const candidate=new Date(wall+hours*3600000);
    const fields=Object.fromEntries(fmt.formatToParts(candidate).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
    if(fields.year===y&&fields.month===m&&fields.day===d&&fields.hour===hh&&fields.minute===mm&&fields.second===ss)
      matches.push(candidate);
  }
  if(matches.length!==1)throw RangeError('Invalid, nonexistent or ambiguous Boston pickup time');
  return matches[0];
}
function router({db,secret,requireAdmin,sendAcceptance,production=false,roundTripProduction=false,productionDatabaseName,stagingEditSecret,stagingEditNotificationEmail,publicOrigin}){
 if(typeof secret!=='string'||Buffer.byteLength(secret)<32)throw Error('Staging booking intake secret missing');
 const r=express.Router();
 require('./booking-acceptance').registerAcceptanceRoute(r,{db,requireAdmin,sendAcceptance});
 const auth=(req,res,next)=>{
  const supplied=req.get('X-Booking-Service-Key')||'';
  const a=crypto.createHash('sha256').update(supplied).digest();
  const b=crypto.createHash('sha256').update(secret).digest();
  if(!supplied||!crypto.timingSafeEqual(a,b))return res.sendStatus(403);
  next();
 };
 r.get('/environment',auth,async(req,res,next)=>{
  try{const q=await db.query('SELECT current_database() AS name');res.set('Cache-Control','no-store').json({mode:production?'production':'staging',databaseVerified:production&&!!productionDatabaseName&&q.rows[0].name===productionDatabaseName,...(roundTripProduction?{roundTripReady:true}:{})})}catch(e){next(e)}
 });
 if(!production||roundTripProduction){
  if(stagingEditSecret){
   require('./round-trip-edit-staging').registerStagingEdits(r,{
    db,requireAdmin,signingSecret:stagingEditSecret,notificationEmail:stagingEditNotificationEmail,sendAcceptance,publicOrigin
   });
  }
  r.post('/round-trip/:reference/send-to-dispatch',requireAdmin,async(req,res,next)=>{
   const {reference}=req.params;
   if(!/^PT-[A-Z0-9-]{4,64}$/.test(reference))return res.sendStatus(400);
   let client;
   try{
    client=await db.connect();
    await client.query('BEGIN');
    const {rows:[booking]}=await client.query(
     "SELECT * FROM pt_customer_bookings WHERE reference=$1 AND trip_type='round_trip' FOR UPDATE",[reference]);
    if(!booking){
     await client.query('ROLLBACK');
     return res.sendStatus(404);
    }
    if(booking.status!=='pending'){
     await client.query('ROLLBACK');
     return res.sendStatus(409);
    }
    const {from,to,date,time}=booking.outbound;
    const legs=[
     {key:'OUTBOUND',from,to,pickup:bostonPickupTime(date,time)},
     {key:'RETURN',from:to,to:from,pickup:bostonPickupTime(booking.return_leg.date,booking.return_leg.time)}
    ];
    if(legs[1].pickup<=legs[0].pickup)throw RangeError('Return is not after departure');
    const surname=booking.customer_name.trim().split(/\s+/).at(-1);
    const trips=[];
    for(const leg of legs){
     // The combined fare stays on the booking. Dispatch legs do not carry separate fares.
     const trip=await client.query(`INSERT INTO dispatch_trips
      (booking_reference,passenger_surname,passenger_phone,pickup_address,destination_address,pickup_at,status)
      VALUES ($1,$2,$3,$4,$5,$6,'pending') RETURNING id`,
     [reference+'-'+leg.key,surname,booking.customer_phone,leg.from,leg.to,leg.pickup]);
     const id=trip.rows[0].id;
     await client.query(`INSERT INTO dispatch_trip_audit(trip_id,actor_role,actor_id,action)
      VALUES ($1,'admin',$2,'created_from_round_trip')`,[id,String(req.session.userId)]);
     trips.push({leg:leg.key,id});
    }
    await client.query("UPDATE pt_customer_bookings SET status='dispatched',version=version+1,updated_at=now() WHERE id=$1",[booking.id]);
    await client.query('COMMIT');
    res.status(201).json({reference,trips});
   }catch(error){
    if(client)await client.query('ROLLBACK').catch(()=>{});
    if(error instanceof RangeError)return res.status(422).json({error:error.message});
    if(error.code==='23505')return res.sendStatus(409);
    next(error);
   }finally{client?.release();}
  });
  r.post('/round-trip/:reference/confirm',requireAdmin,async(req,res,next)=>{
   if(!sendAcceptance)return res.sendStatus(503);
   const {reference}=req.params;
   if(!/^PT-[A-Z0-9-]{4,64}$/.test(reference))return res.sendStatus(400);
   let booking;
   try{
    const claimed=await db.query(`UPDATE pt_customer_bookings
     SET acceptance_notice_status='sending'
     WHERE reference=$1 AND trip_type='round_trip' AND status='dispatched'
     AND acceptance_notice_status IN ('pending','failed')
     AND (SELECT count(*) FROM dispatch_trips
       WHERE booking_reference IN ($1||'-OUTBOUND',$1||'-RETURN')
       AND status IN ('approved','assigned','accepted'))=2
     RETURNING *`,[reference]);
    booking=claimed.rows[0];
    if(!booking)return res.sendStatus(409);
   }catch(error){return next(error);}
   try{
    await sendAcceptance({
     reference,passenger_email:booking.customer_email,passenger_name:booking.customer_name,
     pickup_address:booking.outbound.from,destination_address:booking.outbound.to,
     pickup_local_date:booking.outbound.date,pickup_local_time:booking.outbound.time,
     return_leg:booking.return_leg,fare_cents:booking.fare_cents
    });
    await db.query("UPDATE pt_customer_bookings SET acceptance_notice_status='accepted' WHERE reference=$1",[reference]);
    res.json({notice:'accepted_by_provider'});
   }catch(error){
    const status=error.deliveryRejected?'failed':'unknown';
    await db.query('UPDATE pt_customer_bookings SET acceptance_notice_status=$2 WHERE reference=$1',[reference,status]).catch(()=>{});
    res.status(502).json({notice:status});
   }
  });
  r.post('/round-trip-intake',auth,async(req,res,next)=>{
   const {persistRoundTripRequest}=require('../round-trip/persist-request');
   res.set('Cache-Control','no-store');
   try{
    const stored=await persistRoundTripRequest({db,booking:req.body||{}});
    if(!stored)return res.status(409).json({error:'Booking reference already exists'});
    res.status(201).json({stored:true,reference:stored.reference,status:stored.status});
   }catch(error){
    if(error instanceof RangeError)return res.status(400).json({error:'Invalid round-trip request'});
    next(error);
   }
  });
 }
 r.post('/intake',auth,async(req,res,next)=>{
  const b=req.body||{};
  if(!/^PT-[A-Z0-9-]{4,64}$/.test(b.reference||'')||
   !['luxury','comfort'].includes(b.tier)||!['later','coordinate'].includes(b.payment)||
   !/^\d{4}-\d{2}-\d{2}$/.test(b.date||'')||!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.time||'')||
   ![b.name,b.phone,b.email,b.from,b.to].every(x=>typeof x==='string'&&x.trim()&&x.length<=254)||
   (!(b.quotePending===true&&b.fareCents===null)&&(!Number.isSafeInteger(b.fareCents)||b.fareCents<0))||!Number.isSafeInteger(b.tipCents)||b.tipCents<0)
   return res.status(400).json({error:'Invalid booking'});
  try{
   const q=await db.query(`INSERT INTO booking_requests
    (reference,passenger_name,passenger_phone,passenger_email,pickup_address,destination_address,
     pickup_local_date,pickup_local_time,passenger_count,service_tier,fare_cents,tip_cents,
     payment_preference,special_instructions)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    ON CONFLICT(reference) DO NOTHING RETURNING reference`,
    [b.reference,b.name,b.phone,b.email,b.from,b.to,b.date,b.time,b.passengers||null,b.tier,b.fareCents,b.tipCents,b.payment,b.details||null]);
   if(!q.rowCount){
    // A duplicate reference is only idempotent when every persisted booking field matches.
    // Never silently acknowledge a different passenger, time, route or price.
    const existing=await db.query(`SELECT passenger_name,passenger_phone,passenger_email,pickup_address,destination_address,
      pickup_local_date::text AS pickup_local_date,pickup_local_time::text AS pickup_local_time,
      passenger_count,service_tier,fare_cents,tip_cents,payment_preference,special_instructions
      FROM booking_requests WHERE reference=$1`,[b.reference]);
    const row=existing.rows[0];
    const equal=row&&row.passenger_name===b.name&&row.passenger_phone===b.phone&&
      row.passenger_email===b.email&&row.pickup_address===b.from&&row.destination_address===b.to&&
      String(row.pickup_local_date).slice(0,10)===b.date&&String(row.pickup_local_time).slice(0,5)===b.time&&
      String(row.passenger_count??'')===String(b.passengers??'')&&row.service_tier===b.tier&&
      (row.fare_cents===null?null:Number(row.fare_cents))===b.fareCents&&
      Number(row.tip_cents)===b.tipCents&&row.payment_preference===b.payment&&
      (row.special_instructions??null)===(b.details??null);
    if(!equal)return res.status(409).json({error:'Booking reference already exists with different details'});
   }
   res.status(q.rowCount?201:200).json({stored:true,reference:b.reference});
  }catch(e){next(e)}
 });
 r.get('/inbox',requireAdmin,async(req,res,next)=>{
  try{const q=await db.query(`SELECT reference,passenger_name,pickup_address,destination_address,
   pickup_local_date::text AS pickup_local_date,pickup_local_time::text AS pickup_local_time,
   service_tier,fare_cents,special_instructions,status,dispatch_trip_id,acceptance_notice_status FROM booking_requests
   ORDER BY created_at DESC LIMIT 100`);
   res.set('Cache-Control','no-store').json(q.rows)
  }catch(e){next(e)}
 });
 r.post('/:reference/quote',requireAdmin,async(req,res,next)=>{
  const fare=req.body?.fareCents;
  if(!/^PT-[A-Z0-9-]{4,64}$/.test(req.params.reference)||!Number.isSafeInteger(fare)||fare<=0||fare>10000000)return res.status(400).json({error:'Tarifa inválida'});
  try{
   const result=await db.query("UPDATE booking_requests SET fare_cents=$2,updated_at=NOW() WHERE reference=$1 AND status='received' AND fare_cents IS NULL RETURNING reference",[req.params.reference,fare]);
   if(!result.rowCount)return res.status(409).json({error:'La tarifa ya fue definida o la reserva cambió'});
   res.json({quoted:true});
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
   if(b.fare_cents===null){await client.query('ROLLBACK');return res.status(409).json({error:'Define la tarifa antes de enviar a despacho'})}
   if(b.status==='transferred'){await client.query('COMMIT');return res.json({status:'transferred',id:b.dispatch_trip_id})}
   if(b.status!=='received'){await client.query('ROLLBACK');return res.status(409).json({error:'Not transferable'})}
   const localDate=b.pickup_local_date instanceof Date?b.pickup_local_date.toISOString().slice(0,10):String(b.pickup_local_date).slice(0,10);
   const localTime=String(b.pickup_local_time).slice(0,8);
   const dt=bostonPickupTime(localDate,localTime);
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

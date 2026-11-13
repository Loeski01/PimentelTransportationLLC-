'use strict';
// Staging-only router. Mount exclusively behind a verified administrator session.
// No production route is changed by this module.
const express=require('express');
const {claimBookingForTransfer,markBookingTransferred,markBookingRejectedBeforeCommit}=require('./booking-transfer-lifecycle');
const {getBookingForTransferSQL,inboxRowToDispatch}=require('./inbox-row-to-dispatch');
function createAdminBookingTransferRouter({db,requireAdmin,sendToDispatch,timeZone}) {
 if(!db||typeof db.query!=='function'||typeof requireAdmin!=='function'||
    typeof sendToDispatch!=='function'||typeof timeZone!=='string'||!timeZone)
  throw new TypeError('Authenticated staging transfer dependencies required');
 const router=express.Router();
 // Admin-only inbox: limited, recent items. Never accessible without an admin session.
 router.get('/',requireAdmin,async(req,res,next)=>{
  res.set('Cache-Control','no-store');
  try {
   const result=await db.query(`SELECT reference,passenger_name,passenger_phone,
   passenger_email,pickup_address,destination_address,
   pickup_local_date::text AS pickup_local_date,
   pickup_local_time::text AS pickup_local_time,
   passenger_count,service_tier,fare_cents,tip_cents,status,dispatch_trip_id,created_at
   FROM booking_requests ORDER BY created_at DESC LIMIT 100`);
   res.json(result.rows);
  }catch(error){next(error)}
 });
 router.post('/:reference/send-to-dispatch',requireAdmin,async(req,res,next)=>{
  res.set('Cache-Control','no-store');
  try{
   const reference=req.params.reference;
   if(!/^PT-[A-Z0-9-]{4,64}$/.test(reference))
    return res.status(400).json({error:'Invalid booking reference'});
   const claim=await claimBookingForTransfer(db,reference);
   if(!claim.claimed){
    if(claim.reason==='already-transferred')
     return res.status(200).json({status:'transferred',dispatch_trip_id:claim.tripId,alreadyTransferred:true});
    if(claim.reason==='not-found')return res.status(404).json({error:'Booking not found'});
    return res.status(409).json({error:claim.reason==='in-progress'?'Transfer in progress; reconcile before retry':'Booking not eligible for transfer'});
   }
   // Query only the claimed row. This route never exposes PII in its HTTP response.
   const fetched=await db.query(getBookingForTransferSQL, [reference]);
   if(fetched.rowCount!==1)throw new Error('Claimed booking record missing');
   let payload;
   try {
    payload=inboxRowToDispatch(fetched.rows[0],timeZone);
   }catch(validationError){
    // Local validation failed before contacting dispatch. Safe to reset for correction.
    await markBookingRejectedBeforeCommit(db,reference);
    return res.status(422).json({error:'Booking data needs correction before transfer'});
   }
   // sendToDispatch must be a server-side authenticated client, not browser fetch.
   // Throws on timeout or unknown result; leave status transferring for reconciliation.
   const result=await sendToDispatch(payload);
   if(!result||!Number.isSafeInteger(result.id)||result.id<1||
      !['pending','approved','assigned','accepted','started','completed','cancelled','rejected'].includes(result.status))
      throw new Error('Uncertain dispatch result; reconcile by booking reference');
   const saved=await markBookingTransferred(db,reference,result.id);
   res.status(result.created===true?201:200).json({
    reference:saved.reference,status:saved.status,dispatch_trip_id:saved.dispatch_trip_id
   });
  }catch(e){
   // NEVER reset transferring on timeout, unexpected rejection or uncertain outcome.
   // Reconciliation must check the dispatch unique booking reference first.
   next(e);
  }
 });
 return router;
}
module.exports={createAdminBookingTransferRouter};

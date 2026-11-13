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
   const payload=inboxRowToDispatch(fetched.rows[0],timeZone);
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

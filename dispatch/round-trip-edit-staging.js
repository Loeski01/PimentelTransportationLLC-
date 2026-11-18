'use strict';

const {rateLimit}=require('express-rate-limit');
const {issueEditGrant,verifyEditGrant}=require('../round-trip/edit-grant');
const {persistBookingChange}=require('../round-trip/persist-modification');

const editFields=new Set(['date','time','returnDate','returnTime']);

function registerStagingEdits(router,{db,requireAdmin,signingSecret,notificationEmail}){
  if(!signingSecret)return;
  if(Buffer.byteLength(signingSecret)<32 || !notificationEmail){
    throw new Error('Invalid staging edit configuration');
  }
  const limit=rateLimit({windowMs:60000,limit:10,standardHeaders:'draft-7',legacyHeaders:false});
  const findPending=async(client,reference)=>{
    const result=await client.query(
      "SELECT * FROM pt_customer_bookings WHERE reference=$1 AND trip_type='round_trip' AND status='pending'",
      [reference]);
    return result.rows[0];
  };

  router.post('/round-trip/:reference/edit-grant',requireAdmin,async(req,res,next)=>{
    res.set('Cache-Control','no-store');
    try{
      const row=await findPending(db,req.params.reference);
      if(!row)return res.sendStatus(404);
      res.json({token:issueEditGrant({secret:signingSecret,bookingId:Number(row.id)})});
    }catch(error){next(error);}
  });

  router.post('/round-trip/:reference/edit',limit,async(req,res,next)=>{
    res.set('Cache-Control','no-store');
    const {token,version,patch}=req.body||{};
    if(typeof token!=='string' || token.length>2048)return res.sendStatus(403);
    if(!Number.isSafeInteger(version) || version<1 || !patch ||
      typeof patch!=='object' || !Object.keys(patch).length ||
      Object.keys(patch).some(field=>!editFields.has(field))){
      return res.status(400).json({error:'Invalid schedule change'});
    }
    let client;
    try{
      client=await db.connect();
      const row=await findPending(client,req.params.reference);
      const bookingId=Number(row?.id);
      if(!verifyEditGrant({token,secret:signingSecret,bookingId}))return res.sendStatus(403);
      if(Number(row.version)!==version)return res.sendStatus(409);
      const before={
        reference:row.reference,tripType:row.trip_type,status:row.status,
        ...row.outbound,returnDate:row.return_leg.date,returnTime:row.return_leg.time,
        phone:row.customer_phone,email:row.customer_email,passengers:row.passengers
      };
      const fareCents=Number(row.fare_cents);
      const result=await persistBookingChange({
        client,bookingId,expectedVersion:version,before,patch,
        previousFareCents:fareCents,newFareCents:fareCents,notificationEmail,
        editGrant:{token,secret:signingSecret},requiredStatus:'pending'
      });
      res.json(result);
    }catch(error){
      if(error.code==='EDIT_GRANT_REJECTED')return res.sendStatus(403);
      if(error.code==='BOOKING_CONFLICT')return res.sendStatus(409);
      if(error instanceof RangeError)return res.status(400).json({error:'Invalid schedule change'});
      next(error);
    }finally{client?.release();}
  });
}

module.exports={registerStagingEdits};

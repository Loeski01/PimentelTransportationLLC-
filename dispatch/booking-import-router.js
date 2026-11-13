'use strict';
// Staging-only authenticated transfer router. Mount only after migrations and
// with an independently verified server-to-server authentication middleware.
const express=require('express');
const {createPendingTripFromBooking}=require('./booking-transfer');
function createBookingImportRouter({db,requireServiceAuth}) {
 if(!db||typeof requireServiceAuth!=='function')throw new TypeError('Service authentication required');
 const router=express.Router();
 router.post('/import',requireServiceAuth,async(req,res,next)=>{
  try {
   const result=await createPendingTripFromBooking(db,req.body);
   res.status(result.created?201:200).set('Cache-Control','no-store').json(result);
  }catch(e){
   if(e instanceof TypeError)return res.status(400).json({error:'Invalid booking transfer'});
   next(e);
  }
 });
 return router;
}
module.exports={createBookingImportRouter};

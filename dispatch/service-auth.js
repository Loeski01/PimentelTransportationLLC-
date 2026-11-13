'use strict';
const crypto=require('node:crypto');
// Configure the same independent secret on the booking and dispatch staging services.
// Never reuse admin passwords, session cookies, Stripe keys or driver PINs.
function createServiceAuth(secret) {
 if(typeof secret!=='string'||Buffer.byteLength(secret,'utf8')<32)throw new Error('A dedicated service secret of at least 32 bytes is required');
 const expected=Buffer.from(secret,'utf8');
 return function requireServiceAuth(req,res,next) {
  const value=req.get('X-Booking-Service-Key');
  if(typeof value!=='string')return res.status(401).json({error:'Service authentication required'});
  const actual=Buffer.from(value,'utf8');
  if(actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))
   return res.status(401).json({error:'Service authentication required'});
  next();
 };
}
module.exports={createServiceAuth};

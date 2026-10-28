const crypto=require('node:crypto');
const express=require('express');
// Isolated development authentication module; never mount publicly without TLS,
// persistent sessions, rate limiting, and account lockout.
function hashPin(pin,salt=crypto.randomBytes(16).toString('hex')){
 if(!/^\d{4}$/.test(pin)) throw new Error('PIN must contain four digits');
 const hash=crypto.scryptSync(pin,salt,64).toString('hex');
 return salt+':'+hash;
}
function verifyPin(pin,stored){
 if(!/^\d{4}$/.test(pin)||typeof stored!=='string') return false;
 const [salt,hex]=stored.split(':');
 if(!salt||!hex||!/^[a-f0-9]{128}$/i.test(hex)) return false;
 const expected=Buffer.from(hex,'hex');
 const actual=crypto.scryptSync(pin,salt,64);
 return crypto.timingSafeEqual(actual,expected);
}
function requireRole(role){
 return (req,res,next)=>{
  if(!req.session?.userId||req.session?.role!==role) return res.status(403).json({error:'Forbidden'});
  if(role==='driver') req.driver={id:req.session.userId};
  next();
 };
}
module.exports={hashPin,verifyPin,requireRole};

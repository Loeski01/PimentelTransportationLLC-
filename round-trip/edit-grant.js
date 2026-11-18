'use strict';
// Isolated, single-booking signed edit grants. No production endpoint is enabled here.
const crypto=require('node:crypto');
const b64=value=>Buffer.from(value).toString('base64url');
function issueEditGrant({secret,bookingId,now=Date.now(),ttlMs=15*60*1000}){
 if(typeof secret!=='string'||Buffer.byteLength(secret)<32)throw new RangeError('Strong signing secret required');
 if(!Number.isSafeInteger(bookingId)||bookingId<1)throw new RangeError('Invalid booking ID');
 if(!Number.isSafeInteger(now)||!Number.isSafeInteger(ttlMs)||ttlMs<1||ttlMs>15*60*1000)throw new RangeError('Invalid grant lifetime');
 const payload=b64(JSON.stringify({bookingId,expiresAt:now+ttlMs,nonce:crypto.randomBytes(16).toString('hex')}));
 const mac=crypto.createHmac('sha256',secret).update(payload).digest('base64url');
 return payload+'.'+mac;
}
function verifyEditGrant({token,secret,bookingId,now=Date.now()}){
 if(typeof secret!=='string'||Buffer.byteLength(secret)<32||typeof token!=='string'||!Number.isSafeInteger(bookingId)||bookingId<1)return false;
 const parts=token.split('.');
 if(parts.length!==2||!parts[0]||!parts[1]||token.length>2048)return false;
 const expected=crypto.createHmac('sha256',secret).update(parts[0]).digest();
 let provided;
 try{provided=Buffer.from(parts[1],'base64url')}catch{return false}
 if(provided.length!==expected.length||!crypto.timingSafeEqual(provided,expected))return false;
 try{
  const grant=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));
  return grant.bookingId===bookingId&&Number.isSafeInteger(grant.expiresAt)&&Number.isSafeInteger(now)&&now<grant.expiresAt&&typeof grant.nonce==='string'&&/^[0-9a-f]{32}$/.test(grant.nonce);
 }catch{return false}
}
// Verification is not single-use by itself. Production must atomically consume the nonce
// in a durable database before allowing a modification; never rely on in-memory tracking.
module.exports={issueEditGrant,verifyEditGrant};

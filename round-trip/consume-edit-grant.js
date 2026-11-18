'use strict';
const crypto=require('node:crypto');
const {verifyEditGrant}=require('./edit-grant');
// Consume a signed edit grant in the SAME transaction as the booking modification.
// A rollback must restore the nonce so the user can retry a failed transaction.
async function consumeEditGrant({client,token,secret,bookingId,now=Date.now()}){
 if(!client||typeof client.query!=='function')throw new TypeError('Database client required');
 if(!verifyEditGrant({token,secret,bookingId,now}))return false;
 const [payload]=token.split('.');
 const grant=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
 const nonceHash=crypto.createHash('sha256').update(grant.nonce).digest('hex');
 const result=await client.query(`INSERT INTO pt_booking_edit_grant_uses (nonce_hash,booking_id,expires_at)
 VALUES ($1,$2,to_timestamp($3::double precision / 1000.0))
 ON CONFLICT (nonce_hash) DO NOTHING RETURNING nonce_hash`,[nonceHash,bookingId,grant.expiresAt]);
 return result.rowCount===1;
}
module.exports={consumeEditGrant};

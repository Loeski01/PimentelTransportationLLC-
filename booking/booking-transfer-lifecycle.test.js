'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {claimBookingForTransfer,markBookingTransferred,markBookingRejectedBeforeCommit}=require('./booking-transfer-lifecycle');
const reference='PT-ABC123';
const mock=(result,existing)=>{
 const calls=[];
 return {calls,query:async(sql,params)=>{
  calls.push({sql,params});
  if(sql.startsWith('UPDATE'))return result;
  return existing||{rowCount:0,rows:[]};
 }};
};
test('atomic claim marks booking transferring, increments attempts',async()=>{
 const db=mock({rowCount:1,rows:[{reference,status:'transferring',transfer_attempts:1}]});
 const r=await claimBookingForTransfer(db,reference);
 assert.equal(r.claimed,true);
 assert.match(db.calls[0].sql,/status='received'/);
 assert.match(db.calls[0].sql,/transfer_attempts=transfer_attempts\+1/);
});
test('duplicate click reports in progress instead of transferring twice',async()=>{
 const db=mock({rowCount:0,rows:[]},{rowCount:1,rows:[{reference,status:'transferring',dispatch_trip_id:null}]});
 assert.equal((await claimBookingForTransfer(db,reference)).reason,'in-progress');
});
test('already transferred booking reports original trip ID',async()=>{
 const db=mock({rowCount:0,rows:[]},{rowCount:1,rows:[{reference,status:'transferred',dispatch_trip_id:7}]});
 assert.equal((await claimBookingForTransfer(db,reference)).tripId,7);
});
test('cancelled booking cannot be claimed',async()=>{
 const db=mock({rowCount:0,rows:[]},{rowCount:1,rows:[{reference,status:'cancelled',dispatch_trip_id:null}]});
 assert.equal((await claimBookingForTransfer(db,reference)).reason,'blocked');
});
test('success records dispatch trip only from transferring state',async()=>{
 const db=mock({rowCount:1,rows:[{reference,status:'transferred',dispatch_trip_id:7}]});
 const r=await markBookingTransferred(db,reference,7);
 assert.equal(r.dispatch_trip_id,7);
 assert.match(db.calls[0].sql,/status='transferring'/);
});
test('invalid reference rejected before query',async()=>{
 const db=mock({rowCount:1,rows:[]});
 await assert.rejects(claimBookingForTransfer(db,'BAD'),/Invalid booking reference/);
 assert.equal(db.calls.length,0);
});
test('confirmed dispatch rejection may reset to received',async()=>{
 const db=mock({rowCount:1,rows:[{reference,status:'received'}]});
 assert.equal(await markBookingRejectedBeforeCommit(db,reference),true);
 assert.match(db.calls[0].sql,/status='transferring'/);
});
test('unknown completion must not falsely report success',async()=>{
 const db=mock({rowCount:0,rows:[]});
 await assert.rejects(markBookingTransferred(db,reference,7),/reconcile manually/);
});

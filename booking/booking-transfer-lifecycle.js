'use strict';
// Staging-only building blocks. Endpoints must enforce an administrator session
// before invoking these functions. Never perform HTTP calls inside a DB transaction.
const REF=/^PT-[A-Z0-9-]{4,64}$/;
function validateReference(reference){
 if(typeof reference!=='string'||!REF.test(reference)) throw new TypeError('Invalid booking reference');
}
async function claimBookingForTransfer(db,reference){
 validateReference(reference);
 // Atomic compare-and-swap prevents two admin clicks claiming the same booking.
 const q=await db.query(`UPDATE booking_requests
 SET status='transferring', transfer_attempts=transfer_attempts+1,
     last_transfer_error=NULL, updated_at=NOW()
 WHERE reference=$1 AND status='received' AND dispatch_trip_id IS NULL
 RETURNING reference,transfer_attempts,status`,[reference]);
 if(q.rowCount) return {claimed:true,booking:q.rows[0]};
 // Distinguish blocked, completed, and in-progress without exposing customer PII.
 const existing=await db.query(
  'SELECT reference,status,dispatch_trip_id FROM booking_requests WHERE reference=$1',[reference]);
 if(!existing.rowCount) return {claimed:false,reason:'not-found'};
 const r=existing.rows[0];
 if(r.status==='transferred'&&r.dispatch_trip_id!=null)
   return {claimed:false,reason:'already-transferred',tripId:r.dispatch_trip_id};
 return {claimed:false,reason:r.status==='transferring'?'in-progress':'blocked'};
}
async function markBookingTransferred(db,reference,tripId){
 validateReference(reference);
 if(!Number.isSafeInteger(tripId)||tripId<1) throw new TypeError('Invalid dispatch trip ID');
 const q=await db.query(`UPDATE booking_requests SET status='transferred',
 dispatch_trip_id=$2,transferred_at=NOW(),updated_at=NOW(),last_transfer_error=NULL
 WHERE reference=$1 AND status='transferring'
 RETURNING reference,status,dispatch_trip_id`,[reference,tripId]);
 if(!q.rowCount)throw new Error('Transfer state changed; reconcile manually');
 return q.rows[0];
}
// Only reset after an unequivocal rejection before dispatch committed.
// Network timeouts and unknown outcomes must first query the dispatch by reference.
async function markBookingRejectedBeforeCommit(db,reference){
 validateReference(reference);
 const q=await db.query(`UPDATE booking_requests SET status='received',
 last_transfer_error='Rejected by dispatch',updated_at=NOW()
 WHERE reference=$1 AND status='transferring' RETURNING reference,status`,[reference]);
 return q.rowCount>0;
}
module.exports={claimBookingForTransfer,markBookingTransferred,markBookingRejectedBeforeCommit};

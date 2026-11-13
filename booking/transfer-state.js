'use strict';
// Pure staging state decisions; database UNIQUE constraints remain authoritative.
function transferDecision(booking) {
 if (!booking || !booking.reference) throw new TypeError('Booking reference required');
 if (booking.status === 'transferred' && Number.isSafeInteger(booking.dispatch_trip_id) && booking.dispatch_trip_id > 0) return 'already-transferred';
 if (booking.status === 'received' && booking.dispatch_trip_id == null) return 'transfer';
 if (booking.status === 'transferring') return 'reconcile';
 return 'blocked';
}
module.exports = { transferDecision };

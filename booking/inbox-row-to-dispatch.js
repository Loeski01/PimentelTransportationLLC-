'use strict';
const { bookingToDispatchPayload } = require('./booking-to-dispatch');

// The database query must return pickup_local_date and pickup_local_time as text.
// PostgreSQL DATE must not be silently interpreted as UTC.
function inboxRowToDispatch(row, timeZone) {
  if (!row || typeof row !== 'object') throw new TypeError('Booking row required');
  if (!['received','transferring'].includes(row.status))
    throw new TypeError('Booking not eligible for transfer');
  for (const key of ['reference','passenger_name','pickup_address','destination_address','pickup_local_date','pickup_local_time']) {
    if (typeof row[key] !== 'string' || !row[key].trim()) throw new TypeError('Invalid booking row field: ' + key);
  }
  return bookingToDispatchPayload({
    reference: row.reference,
    name: row.passenger_name,
    from: row.pickup_address,
    to: row.destination_address,
    date: row.pickup_local_date,
    time: row.pickup_local_time.slice(0,5)
  }, timeZone);
}

const getBookingForTransferSQL = `SELECT reference, passenger_name, pickup_address,
  destination_address, pickup_local_date::text AS pickup_local_date,
  pickup_local_time::text AS pickup_local_time, status
  FROM booking_requests WHERE reference=$1`;

module.exports = { inboxRowToDispatch, getBookingForTransferSQL };

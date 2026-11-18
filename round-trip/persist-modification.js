'use strict';
/**
 * Transactional booking modification persistence.
 * Requires an already-authenticated customer and an already-requoted fare.
 * This module never connects to production on its own.
 */
const { buildModificationEvent } = require('./modification');

async function persistBookingChange({ client, bookingId, expectedVersion, before, patch, previousFareCents, newFareCents, notificationEmail }) {
  if (!client || typeof client.query !== 'function') throw new TypeError('Database client required');
  if (!Number.isSafeInteger(bookingId) || bookingId <= 0 || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1)
    throw new RangeError('Invalid booking ID or version');
  if (!notificationEmail || typeof notificationEmail !== 'string') throw new RangeError('Admin email required');
  const event = buildModificationEvent({before,patch,previousFareCents,newFareCents});
  // Contact/passenger edits require separate persisted columns; reject rather than silently lose them.
  if (event.changes.some(change => !['from','to','date','time','returnDate','returnTime'].includes(change.field)))
    throw new RangeError('Contact and passenger edits not yet supported by persistence');
  const { after } = event;
  // Require the database row to match the snapshot used for validation and pricing.
  // Prevent stale fare/schedule data from being overwritten even if a caller supplies an old version.
  const snapshotOutbound = JSON.stringify({from:before.from,to:before.to,date:before.date,time:before.time});
  const snapshotReturn = before.tripType === 'round_trip' ? JSON.stringify({date:before.returnDate,time:before.returnTime}) : null;
  await client.query('BEGIN');
  try {
    const updated = await client.query(
      `UPDATE pt_customer_bookings
       SET outbound=$1::jsonb, return_leg=$2::jsonb, fare_cents=$3, version=version+1, updated_at=now()
       WHERE id=$4 AND version=$5 AND status IN ('pending','approved','confirmed')
       AND reference=$6 AND fare_cents=$7
       AND outbound=$8::jsonb AND return_leg IS NOT DISTINCT FROM $9::jsonb
       RETURNING id,version,reference`,
      [
        JSON.stringify({from:after.from,to:after.to,date:after.date,time:after.time}),
        after.tripType === 'round_trip' ? JSON.stringify({date:after.returnDate,time:after.returnTime}) : null,
        newFareCents,bookingId,expectedVersion,before.reference,previousFareCents,snapshotOutbound,snapshotReturn
      ]
    );
    if (updated.rowCount !== 1 || updated.rows[0].reference !== before.reference) {
      const error = new Error('Booking changed or is no longer editable');
      error.code = 'BOOKING_CONFLICT';
      throw error;
    }
    const version = Number(updated.rows[0].version);
    await client.query(
      `INSERT INTO pt_booking_change_events
       (event_id,booking_id,booking_version,actor,changes,previous_fare_cents,new_fare_cents)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)`,
      [event.eventId,bookingId,version,event.actor,JSON.stringify(event.changes),previousFareCents,newFareCents]
    );
    await client.query(
      `INSERT INTO pt_booking_notification_outbox (event_id,recipient_email) VALUES ($1,$2)`,
      [event.eventId,notificationEmail]
    );
    await client.query('COMMIT');
    return {eventId:event.eventId,bookingReference:event.bookingReference,version,notificationQueued:true};
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
module.exports = {persistBookingChange};

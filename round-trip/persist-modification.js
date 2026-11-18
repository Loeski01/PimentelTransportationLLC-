'use strict';
/**
 * Transactional booking modification persistence.
 * Requires an already-authenticated customer and an already-requoted fare.
 * This module never connects to production on its own.
 */
const { buildModificationEvent } = require('./modification');
const { consumeEditGrant } = require('./consume-edit-grant');

async function persistBookingChange({ client, bookingId, expectedVersion, before, patch, previousFareCents, newFareCents, notificationEmail, editGrant }) {
  if (!client || typeof client.query !== 'function') throw new TypeError('Database client required');
  if (!Number.isSafeInteger(bookingId) || bookingId <= 0 || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1)
    throw new RangeError('Invalid booking ID or version');
  if (!notificationEmail || typeof notificationEmail !== 'string') throw new RangeError('Admin email required');
  const event = buildModificationEvent({before,patch,previousFareCents,newFareCents});
  // Persist contact and passenger edits alongside itinerary changes atomically.
  const { after } = event;
  // Require the database row to match the snapshot used for validation and pricing.
  // Prevent stale fare/schedule data from being overwritten even if a caller supplies an old version.
  const snapshotOutbound = JSON.stringify({from:before.from,to:before.to,date:before.date,time:before.time});
  const snapshotReturn = before.tripType === 'round_trip' ? JSON.stringify({date:before.returnDate,time:before.returnTime}) : null;
  await client.query('BEGIN');
  try {
    // An authorized production caller must pass an editGrant; consuming it inside
    // this transaction makes replay prevention atomic with the booking update.
    // Legacy isolated callers may omit it while the production route remains disabled.
    if (editGrant) {
      const accepted = await consumeEditGrant({client,token:editGrant.token,secret:editGrant.secret,bookingId,now:editGrant.now});
      if (!accepted) {
        const error = new Error('Edit authorization invalid, expired or already used');
        error.code = 'EDIT_GRANT_REJECTED';
        throw error;
      }
    }
    const updated = await client.query(
      `UPDATE pt_customer_bookings
       SET outbound=$1::jsonb, return_leg=$2::jsonb, fare_cents=$3, customer_phone=$10, customer_email=$11, passengers=$12, version=version+1, updated_at=now()
       WHERE id=$4 AND version=$5 AND status IN ('pending','approved','confirmed')
       AND reference=$6 AND fare_cents=$7
       AND outbound=$8::jsonb AND return_leg IS NOT DISTINCT FROM $9::jsonb
       AND customer_phone IS NOT DISTINCT FROM $13
       AND customer_email IS NOT DISTINCT FROM $14
       AND passengers IS NOT DISTINCT FROM $15
       RETURNING id,version,reference`,
      [
        JSON.stringify({from:after.from,to:after.to,date:after.date,time:after.time}),
        after.tripType === 'round_trip' ? JSON.stringify({date:after.returnDate,time:after.returnTime}) : null,
        newFareCents,bookingId,expectedVersion,before.reference,previousFareCents,snapshotOutbound,snapshotReturn,
        after.phone ?? null,after.email ?? null,after.passengers ?? null,
        before.phone ?? null,before.email ?? null,before.passengers ?? null
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

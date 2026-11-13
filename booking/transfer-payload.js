'use strict';
// Pure mapping helper for staging integration. No network calls or side effects.
// pickup_at must be built by the backend using the service timezone.
function toPendingDispatchTrip(booking, pickupAt) {
  if (!booking || typeof booking !== 'object') throw new TypeError('Booking required');
  if (!/^PT-[A-Z0-9-]{4,64}$/.test(booking.reference || '')) throw new TypeError('Invalid booking reference');
  if (typeof pickupAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(pickupAt) || !Number.isFinite(Date.parse(pickupAt))) throw new TypeError('Timezone-aware pickupAt required');
  const name = String(booking.passenger_name || '').trim();
  const surname = name.split(/\s+/).at(-1);
  const pickup = String(booking.pickup_address || '').trim();
  const destination = String(booking.destination_address || '').trim();
  if (!surname || !pickup || !destination) throw new TypeError('Incomplete booking');
  return Object.freeze({
    booking_reference: booking.reference,
    passenger_surname: surname,
    pickup_address: pickup,
    destination_address: destination,
    pickup_at: pickupAt,
    status: 'pending'
  });
}
module.exports = { toPendingDispatchTrip };

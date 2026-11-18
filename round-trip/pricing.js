'use strict';

/**
 * Round-trip fare calculations. All amounts are integer USD cents.
 * The server must independently quote both directions before calling this.
 * No discount applies to tips, tolls, parking, or other extras.
 */
function roundTripTotals(outboundFareCents, returnFareCents, extrasCents = 0) {
  for (const value of [outboundFareCents, returnFareCents, extrasCents]) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError('Fare amounts must be nonnegative integer cents');
    }
  }
  const subtotalCents = outboundFareCents + returnFareCents;
  if (!Number.isSafeInteger(subtotalCents)) throw new RangeError('Subtotal overflow');
  const discountCents = Math.round(subtotalCents * 0.10);
  const totalCents = subtotalCents - discountCents + extrasCents;
  if (!Number.isSafeInteger(totalCents)) throw new RangeError('Total overflow');
  return { outboundFareCents, returnFareCents, subtotalCents, discountCents, extrasCents, totalCents };
}

function validReturnSchedule(outboundDate, outboundTime, returnDate, returnTime) {
  const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0,10) === value;
  const validTime = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  if (![outboundDate, returnDate].every(validDate) || ![outboundTime, returnTime].every(validTime)) return false;
  return returnDate + 'T' + returnTime > outboundDate + 'T' + outboundTime;
}

module.exports = { roundTripTotals, validReturnSchedule };

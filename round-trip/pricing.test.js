'use strict';
const assert = require('node:assert/strict');
const { roundTripTotals, validReturnSchedule } = require('./pricing');

assert.deepEqual(roundTripTotals(10000, 10000), {
  outboundFareCents:10000, returnFareCents:10000, subtotalCents:20000,
  discountCents:2000, extrasCents:0, totalCents:18000
});
assert.equal(roundTripTotals(10000, 10000, 1500).totalCents, 19500);
assert.equal(roundTripTotals(10001, 10000).discountCents, 2000);
assert.throws(() => roundTripTotals(-1, 10000), RangeError);
assert.equal(validReturnSchedule('2026-11-18','10:00','2026-11-18','18:00'), true);
assert.equal(validReturnSchedule('2026-11-18','10:00','2026-11-19','08:00'), true);
assert.equal(validReturnSchedule('2026-11-18','10:00','2026-11-18','09:00'), false);
assert.equal(validReturnSchedule('2026-11-18','10:00','2026-11-18','10:00'), false);
assert.equal(validReturnSchedule('2026-02-30','10:00','2026-03-01','10:00'), false);
console.log('Round-trip pricing tests passed');

'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const {toPendingDispatchTrip} = require('./transfer-payload');
const sample = {reference:'PT-ABC123',passenger_name:'Maria Castillo',pickup_address:'Boston Logan',destination_address:'Woburn MA'};
test('maps booking to pending trip without assigning driver', () => {
 const trip = toPendingDispatchTrip(sample,'2026-11-14T14:30:00-05:00');
 assert.equal(trip.booking_reference,'PT-ABC123');
 assert.equal(trip.passenger_surname,'Castillo');
 assert.equal(trip.status,'pending');
 assert.equal(Object.hasOwn(trip,'driver_id'),false);
});
test('rejects pickup times without timezone', () => {
 assert.throws(()=>toPendingDispatchTrip(sample,'2026-11-14T14:30:00'),/Timezone-aware/);
});
test('rejects missing reference', () => {
 assert.throws(()=>toPendingDispatchTrip({...sample,reference:''},'2026-11-14T14:30:00-05:00'),/reference/);
});

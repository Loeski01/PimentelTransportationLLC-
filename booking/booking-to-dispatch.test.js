'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {bookingToDispatchPayload,zonedParts}=require('./booking-to-dispatch');
const booking={reference:'PT-ABC123',name:'Maria Castillo',from:'Logan Airport',to:'Woburn, MA',date:'2026-11-14',time:'14:30',phone:'6175550100',email:'maria@example.com',fareCents:6500};
test('maps only allowlisted dispatch fields and converts Eastern local time',()=>{
 const result=bookingToDispatchPayload(booking,'America/New_York');
 assert.deepEqual(Object.keys(result).sort(),['booking_reference','passenger_surname','pickup_address','destination_address','pickup_at'].sort());
 assert.equal(result.passenger_surname,'Castillo');
 assert.equal(result.pickup_at,'2026-11-14T19:30:00.000Z');
 assert.equal('phone' in result,false);assert.equal('email' in result,false);assert.equal('fareCents' in result,false);
});
test('rejects missing explicit timezone',()=>assert.throws(()=>bookingToDispatchPayload(booking,''),/time zone/));
test('rejects nonexistent spring-forward local time',()=>assert.throws(()=>zonedParts('2026-03-08','02:30','America/New_York'),/Nonexistent/));
test('rejects ambiguous fall-back local time',()=>assert.throws(()=>zonedParts('2026-11-01','01:30','America/New_York'),/Ambiguous/));
test('rejects invalid booking reference',()=>assert.throws(()=>bookingToDispatchPayload({...booking,reference:'bad'},'America/New_York'),/Invalid booking/));

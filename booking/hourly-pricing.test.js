'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {calculateHourlyBooking}=require('./hourly-pricing');
test('three-hour executive minimum',()=>assert.deepEqual(calculateHourlyBooking({hours:3,tier:'luxury'}),{hours:3,tier:'luxury',fareCents:28500,tipCents:0,totalCents:28500}));
test('comfort rate and tip',()=>assert.equal(calculateHourlyBooking({hours:4,tier:'comfort',tipPercent:10}).totalCents,33000));
test('fractional quarter-hour',()=>assert.equal(calculateHourlyBooking({hours:3.25,tier:'luxury'}).fareCents,30875));
for(const hours of [0,2.5,24.25,3.1,NaN,Infinity,'3'])test('reject hours '+String(hours),()=>assert.throws(()=>calculateHourlyBooking({hours,tier:'luxury'})));
test('reject invalid tier',()=>assert.throws(()=>calculateHourlyBooking({hours:3,tier:'unknown'})));
test('reject conflicting tip',()=>assert.throws(()=>calculateHourlyBooking({hours:3,tier:'luxury',tipPercent:10,tipCents:500})));

test('comfort minimum two hours',()=>assert.equal(calculateHourlyBooking({hours:2,tier:'comfort'}).fareCents,15000));
test('comfort below minimum rejected',()=>assert.throws(()=>calculateHourlyBooking({hours:1.75,tier:'comfort'})));
test('executive two hours rejected',()=>assert.throws(()=>calculateHourlyBooking({hours:2,tier:'luxury'})));

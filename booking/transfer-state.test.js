'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {transferDecision} = require('./transfer-state');
test('new booking can be transferred',()=>assert.equal(transferDecision({reference:'PT-ABC123',status:'received',dispatch_trip_id:null}),'transfer'));
test('completed transfer returns existing trip instead of creating another',()=>assert.equal(transferDecision({reference:'PT-ABC123',status:'transferred',dispatch_trip_id:42}),'already-transferred'));
test('in-flight transfer must reconcile after timeout',()=>assert.equal(transferDecision({reference:'PT-ABC123',status:'transferring',dispatch_trip_id:null}),'reconcile'));
test('cancelled booking cannot transfer',()=>assert.equal(transferDecision({reference:'PT-ABC123',status:'cancelled',dispatch_trip_id:null}),'blocked'));
test('invalid missing reference is rejected',()=>assert.throws(()=>transferDecision({status:'received'}),/reference/));

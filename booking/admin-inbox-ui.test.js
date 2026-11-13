'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {bookingAction,validReference}=require('./admin-inbox-ui');
test('received booking enables manual dispatch button',()=>{
 assert.deepEqual(bookingAction('received'),{label:'Enviar a despacho',enabled:true});
});
test('in progress booking blocks additional clicks',()=>{
 assert.equal(bookingAction('transferring').enabled,false);
});
test('already transferred booking has disabled button',()=>{
 assert.equal(bookingAction('transferred').enabled,false);
});
test('cancelled booking has disabled button',()=>{
 assert.equal(bookingAction('cancelled').enabled,false);
});
test('reference path is validated before rendering action',()=>{
 assert.equal(validReference('PT-ABC123'),true);
 assert.equal(validReference('../other'),false);
});

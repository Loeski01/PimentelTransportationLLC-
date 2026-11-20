'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync(require('node:path').join(__dirname,'..','index.html'),'utf8');
test('hourly form posts to durable booking endpoint',()=>{
 assert.match(html,/window\.sendHourlyRequest=async function\(/);
 assert.match(html,/fetch\(API\+'\/api\/hourly-booking-request'/);
 assert.match(html,/data\.received!==true\|\|!data\.reference/);
});
test('hourly form uses correct per-tier minimum',()=>{
 assert.match(html,/hours\.min=selectedTier\(\)==='comfort'\?'2':'3'/);
 assert.match(html,/h<\(selectedTier\(\)==='comfort'\?2:3\)/);
});
test('hourly request does not direct customers to pay or confirm a driver',()=>{
 const start=html.indexOf('window.sendHourlyRequest=async function(');
 assert.ok(start>0);
 const end=html.indexOf('type.addEventListener',start);
 const handler=html.slice(start,end);
 assert.match(handler,/Pending company approval/);
 assert.match(handler,/No payment collected/);
 assert.doesNotMatch(handler,/stripe\.redirectToCheckout|assignDriver\(/);
});

test('hourly booking has only one active form submission path',()=>{
 const helper=fs.readFileSync(require('node:path').join(__dirname,'hourly-form-integration.js'),'utf8');
 assert.doesNotMatch(helper,/form\.addEventListener\s*\(\s*['"]submit['"]/);
 assert.match(html,/window\.sendHourlyRequest=async function\(/);
});

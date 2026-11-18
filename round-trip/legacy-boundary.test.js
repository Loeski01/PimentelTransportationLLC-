'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
function route(start,end) {
 const a=server.indexOf(start);
 assert.ok(a>=0,'Missing endpoint '+start);
 const b=server.indexOf(end,a+start.length);
 assert.ok(b>a,'Missing route boundary '+end);
 return server.slice(a,b);
}
const quote=route('app.post("/api/round-trip-quote"','app.post("/api/create-checkout-session"');
assert.match(route("async function calculateRoundTrip", "// Round-trip preview only"),/roundTripTotals\(outbound\.transportOnlyCents, inbound\.transportOnlyCents, airportExtrasCents\)/);
assert.match(quote,/status: "estimate_only"/);
const checkout=route('app.post("/api/create-checkout-session"','app.post("/api/booking-request"');
assert.match(checkout,/req\.body\?\.tripType === "round_trip"/);
assert.match(checkout,/ROUND_TRIP_NOT_ENABLED/);
const booking=route('app.post("/api/booking-request"','app.get("/api/integration-preflight"');
assert.match(booking,/req\.body\?\.tripType === "round_trip"/);
assert.match(booking,/ROUND_TRIP_NOT_ENABLED/);
assert.match(booking,/BOOKING_DISPATCH_PRODUCTION_ENABLED/);
const preflight=route('app.get("/api/integration-preflight"','const PORT =');
assert.match(preflight,/configurationReady/);
assert.match(preflight,/does not verify dispatch connectivity/);
console.log('Legacy payment and booking boundaries verified (isolated source contract checks)');

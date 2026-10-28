"use strict";
// Verified against Stripe's current stable version documentation and SDK 23.0.1.
const API_VERSION="2026-09-30.endive";
const INTEGRATION_IDENTIFIER="pimentel_dispatch_qjdnkvpa";
function isTestKey(value){return typeof value==="string"&&/^(sk|rk)_test_/.test(value);}
module.exports={API_VERSION,INTEGRATION_IDENTIFIER,isTestKey};

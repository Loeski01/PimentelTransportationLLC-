'use strict';
// Private, server-to-server client for STAGING booking imports.
// Never use this module from a browser, expose its secret, or retry an uncertain response.
function createDispatchSender({baseUrl,secret,fetchImpl=fetch,timeoutMs=8000}) {
 if (typeof baseUrl!=='string') throw new TypeError('Dispatch URL required');
 const u=new URL(baseUrl);
 if(u.protocol!=='https:' || u.username || u.password || u.search || u.hash ||
    u.pathname!=='/' || !u.hostname || !/^[a-z0-9.-]+\.onrender\.com$/i.test(u.hostname))
  throw new TypeError('Explicit HTTPS staging Render host required');
 if(typeof secret!=='string'||Buffer.byteLength(secret,'utf8')<32)
  throw new TypeError('Dedicated dispatch secret required');
 if(typeof fetchImpl!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>30000)
  throw new TypeError('Invalid dispatch transport configuration');
 const endpoint=u.origin+'/dispatch/booking/import';
 return async function sendToDispatch(payload) {
  if(!payload||typeof payload!=='object'||!/^PT-[A-Z0-9-]{4,64}$/.test(payload.booking_reference||''))
   throw new TypeError('Valid booking payload required');
  const response=await fetchImpl(endpoint,{
   method:'POST',redirect:'error',signal:AbortSignal.timeout(timeoutMs),
   headers:{'Content-Type':'application/json','Accept':'application/json',
    'X-Booking-Service-Key':secret},
   body:JSON.stringify(payload)
  });
  if(!response.ok) throw new Error('Dispatch transfer rejected or uncertain; reconcile before retry');
  const value=await response.json();
  if(!value||!Number.isSafeInteger(value.id)||value.id<1||
     typeof value.status!=='string'||typeof value.created!=='boolean')
   throw new Error('Unexpected dispatch response; reconcile before retry');
  return value;
 };
}
module.exports={createDispatchSender};

'use strict';
/**
 * Production booking -> dispatch transport configuration.
 * Deliberately excludes staging endpoints and refuses to send when disabled.
 * This module is not connected to the public booking route until production
 * dispatch and database isolation have been independently verified.
 */
function createProductionDispatchSender({endpoint,secret,enabled=false,fetchImpl=fetch}) {
  if(enabled!==true) throw new Error('Production forwarding is disabled');
  if(typeof secret!=='string'||Buffer.byteLength(secret,'utf8')<32) throw new Error('Dedicated production secret required');
  if(typeof endpoint!=='string') throw new Error('Production dispatch endpoint required');
  const url=new URL(endpoint);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||
     url.pathname!=='/booking/intake'||!/^[a-z0-9.-]+\.onrender\.com$/i.test(url.hostname)||
     /staging|test|dev/i.test(url.hostname)) throw new Error('Dedicated HTTPS production intake required');
  return async function forward(booking) {
    if(!booking||!/^PT-[A-Z0-9-]{4,64}$/.test(booking.reference||'')) throw new Error('Invalid booking reference');
    const response=await fetchImpl(url.toString(),{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),
      headers:{'Content-Type':'application/json','X-Booking-Service-Key':secret},
      body:JSON.stringify(booking)
    });
    if(!response.ok) throw new Error('Dispatch intake not acknowledged; reconcile before retry');
    return response.json();
  };
}
module.exports={createProductionDispatchSender};

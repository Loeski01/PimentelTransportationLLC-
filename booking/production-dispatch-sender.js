'use strict';
/**
 * Production booking -> dispatch transport configuration.
 * Deliberately excludes staging endpoints and refuses to send when disabled.
 * This module is not connected to the public booking route until production
 * dispatch and database isolation have been independently verified.
 */
function createProductionDispatchSender({endpoint,secret,enabled=false,promotedProductionHost,roundTrip=false,fetchImpl=fetch}) {
  if(enabled!==true) throw new Error('Production forwarding is disabled');
  if(typeof secret!=='string'||Buffer.byteLength(secret,'utf8')<32) throw new Error('Dedicated production secret required');
  if(typeof endpoint!=='string') throw new Error('Production dispatch endpoint required');
  const url=new URL(endpoint);
  const promoted=typeof promotedProductionHost==='string'&&promotedProductionHost===url.hostname;
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||
     url.pathname!=='/booking/intake'||!/^[a-z0-9.-]+\.onrender\.com$/i.test(url.hostname)||
     (/staging|test|dev/i.test(url.hostname)&&!promoted)) throw new Error('Dedicated HTTPS production intake required');
  const intakeUrl=roundTrip?new URL('/booking/round-trip-intake',url):url;
  async function verifyReady() {
    if(promoted||roundTrip){
      const check=await fetchImpl(new URL('/booking/environment',url).toString(),{redirect:'error',signal:AbortSignal.timeout(5000),headers:{'X-Booking-Service-Key':secret}});
      if(!check.ok)throw new Error('Production environment not verified');
      const environment=await check.json();
      if(environment.mode!=='production'||environment.databaseVerified!==true||
        (roundTrip&&environment.roundTripReady!==true))throw new Error('Production environment not verified');
    }
  }
  async function forward(booking) {
    if(!booking||!/^PT-[A-Z0-9-]{4,64}$/.test(booking.reference||'')) throw new Error('Invalid booking reference');
    await verifyReady();
    const response=await fetchImpl(intakeUrl.toString(),{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),
      headers:{'Content-Type':'application/json','X-Booking-Service-Key':secret},
      body:JSON.stringify(booking)
    });
    if(!response.ok) throw new Error('Dispatch intake not acknowledged; reconcile before retry');
    const acknowledgement=await response.json();
    if(!acknowledgement || acknowledgement.stored!==true || acknowledgement.reference!==booking.reference)
      throw new Error('Dispatch acknowledgement mismatch; reconcile before retry');
    return acknowledgement;
  }
  return Object.assign(forward,{verifyReady});
}
module.exports={createProductionDispatchSender};

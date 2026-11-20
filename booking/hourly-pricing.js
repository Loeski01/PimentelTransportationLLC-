'use strict';

// Server-authoritative hourly fare; never accept a price supplied by the browser.
const HOURLY_RATES_CENTS=Object.freeze({luxury:9500,comfort:7500});
function calculateHourlyBooking({hours,tier,tipPercent=0,tipCents=0}){
  if(typeof hours!=='number'||!Number.isFinite(hours)||hours<(tier==='comfort'?2:3)||hours>24||Math.round(hours*4)!==hours*4)
    throw new RangeError('Hours must be in quarter-hour increments from the tier minimum through 24');
  if(!Object.prototype.hasOwnProperty.call(HOURLY_RATES_CENTS,tier))
    throw new RangeError('Invalid service tier');
  if(![0,10,15,20].includes(tipPercent)||!Number.isSafeInteger(tipCents)||tipCents<0||tipCents>100000||(tipPercent>0&&tipCents>0))
    throw new RangeError('Invalid tip');
  const fareCents=Math.round(hours*HOURLY_RATES_CENTS[tier]);
  const calculatedTipCents=tipPercent>0?Math.round(fareCents*tipPercent/100):tipCents;
  return {hours,tier,fareCents,tipCents:calculatedTipCents,totalCents:fareCents+calculatedTipCents};
}
module.exports={calculateHourlyBooking,HOURLY_RATES_CENTS};

'use strict';
function buildBookingRecord(body, reference, fareCents) {
 if (!body || typeof body !== 'object') throw new TypeError('Booking body required');
 if (!Number.isSafeInteger(fareCents) || fareCents < 0) throw new TypeError('Server-calculated fare required');
 const tipPercent=Number(body.tipPercent), tipInput=Number(body.tipCents);
 if (![0,10,15,20].includes(tipPercent) || !Number.isSafeInteger(tipInput) || tipInput<0 || tipInput>100000 || (tipPercent>0 && tipInput>0)) throw new TypeError('Invalid tip');
 const tipCents=tipPercent ? Math.round(fareCents*tipPercent/100) : tipInput;
 return {reference,name:body.name,phone:body.phone,email:body.email,from:body.from,to:body.to,date:body.date,time:body.time,passengers:body.passengers,details:body.details,payment:body.payment,tier:body.tier||'luxury',fareCents,tipCents};
}
module.exports={buildBookingRecord};

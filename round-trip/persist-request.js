'use strict';

const {validReturnSchedule}=require('./pricing');

async function persistRoundTripRequest({db, booking}) {
  const {reference, name, email, phone, passengers, from, to, date, time,
    returnDate, returnTime, tier, fareCents, extrasCents, tipCents}=booking;
  const validText=(value,max)=>typeof value==='string' && value.trim().length>0 && value.length<=max;
  if (typeof reference!=='string' || !/^PT-[A-Z0-9-]{4,64}$/.test(reference) ||
      !validText(name,100) || !validText(phone,40) || !validText(email,254) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !validText(from,200) || !validText(to,200) ||
      (passengers!=null && !validText(passengers,20)) ||
      !['luxury','comfort'].includes(tier) ||
      !validReturnSchedule(date,time,returnDate,returnTime) ||
      ![fareCents,extrasCents,tipCents].every(value=>Number.isSafeInteger(value) && value>=0) ||
      extrasCents>fareCents) {
    throw new RangeError('Invalid round-trip request');
  }
  const outbound=JSON.stringify({from,to,date,time});
  const inbound=JSON.stringify({date:returnDate,time:returnTime});
  const result=await db.query(`INSERT INTO pt_customer_bookings
    (reference,customer_name,customer_email,customer_phone,passengers,trip_type,tier,
     outbound,return_leg,fare_cents,extras_cents,tip_cents)
    VALUES ($1,$2,$3,$4,$5,'round_trip',$6,$7::jsonb,$8::jsonb,$9,$10,$11)
    ON CONFLICT (reference) DO NOTHING RETURNING reference,status`,
  [reference,name,email,phone,passengers??null,tier,outbound,inbound,fareCents,extrasCents,tipCents]);
  return result.rows[0] ?? null;
}

module.exports={persistRoundTripRequest};

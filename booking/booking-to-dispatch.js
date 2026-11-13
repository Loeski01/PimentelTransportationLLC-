'use strict';
// Allowlisted adapter: booking data stays in the booking inbox; only dispatch fields cross services.
function zonedParts(date, time, timeZone) {
 if (typeof timeZone !== 'string' || !timeZone) throw new TypeError('Explicit IANA time zone required');
 const m = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(date || '');
 const t = /^([01]\\d|2[0-3]):([0-5]\\d)$/.exec(time || '');
 if (!m || !t) throw new TypeError('Invalid local pickup date or time');
 const target = {year:+m[1],month:+m[2],day:+m[3],hour:+t[1],minute:+t[2]};
 const wall = Date.UTC(target.year,target.month-1,target.day,target.hour,target.minute);
 const validCalendar = new Date(wall).getUTCFullYear()===target.year && new Date(wall).getUTCMonth()+1===target.month && new Date(wall).getUTCDate()===target.day;
 if (!validCalendar) throw new TypeError('Invalid calendar date');
 const fmt = new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const offsets = new Set();
 for (let delta=-36; delta<=36; delta+=6) {
  const sample = new Date(wall+delta*3600000);
  const p = Object.fromEntries(fmt.formatToParts(sample).filter(x=>x.type!=='literal').map(x=>[x.type,+x.value]));
  const represented = Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute);
  offsets.add((represented-sample.getTime())/60000);
 }
 const candidates = [];
 for (const offset of offsets) {
  const instant = new Date(wall-offset*60000);
  const p = Object.fromEntries(fmt.formatToParts(instant).filter(x=>x.type!=='literal').map(x=>[x.type,+x.value]));
  if (p.year===target.year && p.month===target.month && p.day===target.day && p.hour===target.hour && p.minute===target.minute) candidates.push(instant);
 }
 if (candidates.length!==1) throw new TypeError(candidates.length ? 'Ambiguous local pickup time' : 'Nonexistent local pickup time');
 return candidates[0].toISOString();
}
function bookingToDispatchPayload(booking, timeZone) {
 if (!booking || typeof booking!=='object') throw new TypeError('Booking required');
 const reference=booking.reference;
 const name=typeof booking.name==='string'?booking.name.trim():'';
 const surname=name.split(/\\s+/).filter(Boolean).slice(-1)[0] || '';
 const pickup=typeof booking.from==='string'?booking.from.trim():'';
 const destination=typeof booking.to==='string'?booking.to.trim():'';
 if (typeof reference!=='string' || !/^PT-[A-Z0-9-]{4,64}$/.test(reference) || !surname || surname.length>250 || !pickup || pickup.length>250 || !destination || destination.length>250) throw new TypeError('Invalid booking fields for dispatch');
 return {booking_reference:reference,passenger_surname:surname,pickup_address:pickup,destination_address:destination,pickup_at:zonedParts(booking.date,booking.time,timeZone)};
}
module.exports={bookingToDispatchPayload,zonedParts};

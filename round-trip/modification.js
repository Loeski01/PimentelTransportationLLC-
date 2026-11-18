'use strict';
const crypto = require('node:crypto');

const ALLOWED_FIELDS = Object.freeze(['from','to','date','time','returnDate','returnTime','phone','email','passengers']);
const clean = value => typeof value === 'string' ? value.trim() : '';
function diffBooking(before, patch) {
  if (!before || typeof before !== 'object' || !patch || typeof patch !== 'object' || Array.isArray(patch))
    throw new TypeError('Invalid booking or changes');
  const keys = Object.keys(patch);
  if (!keys.length || keys.some(key => !ALLOWED_FIELDS.includes(key)))
    throw new RangeError('Unsupported or empty booking modification');
  const after = { ...before };
  const changes = [];
  for (const key of keys) {
    const value = clean(patch[key]);
    if (!value || value.length > 254) throw new RangeError('Invalid field: ' + key);
    if (key === 'date' || key === 'returnDate') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value + 'T00:00:00Z')) ||
          new Date(value + 'T00:00:00Z').toISOString().slice(0,10) !== value) throw new RangeError('Invalid date');
    }
    if ((key === 'time' || key === 'returnTime') && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new RangeError('Invalid time');
    if (value !== before[key]) { changes.push({ field:key, oldValue:before[key] ?? null, newValue:value }); after[key]=value; }
  }
  if (!changes.length) throw new RangeError('No changes');
  if (before.tripType === 'round_trip') {
    const {validReturnSchedule} = require('./pricing');
    if (!validReturnSchedule(after.date,after.time,after.returnDate,after.returnTime))
      throw new RangeError('Return must be after departure');
  }
  // Dispatch uses additional active states; fail closed once a driver is en route or arrived.
  if (['en_route','on_the_way','arrived','waiting','started','in_progress','completed','cancelled','no_show'].includes(String(before.status).toLowerCase()))
    throw new RangeError('Booking is not eligible for self-service modification');
  return {after,changes};
}
function buildModificationEvent({before,patch,actor='customer',previousFareCents,newFareCents,now=new Date()}) {
  if (!Number.isSafeInteger(previousFareCents)||previousFareCents<0||!Number.isSafeInteger(newFareCents)||newFareCents<0)
    throw new RangeError('Invalid fare');
  const {after,changes}=diffBooking(before,patch);
  return {
    eventId:crypto.randomUUID(),bookingReference:before.reference,
    actor,occurredAt:now.toISOString(),changes,
    previousFareCents,newFareCents,priceDifferenceCents:newFareCents-previousFareCents,
    after
  };
}
function adminModificationMessage(event) {
  return [
    'Booking modified / Reserva modificada',
    'Reference / Referencia: '+event.bookingReference,
    'Customer / Cliente: '+(event.after.name||''),
    'Date / Fecha: '+event.occurredAt,
    ...event.changes.map(c=>c.field+': '+String(c.oldValue??'(none)')+' -> '+c.newValue),
    'Previous fare / Tarifa anterior (cents): '+event.previousFareCents,
    'New fare / Tarifa nueva (cents): '+event.newFareCents,
    'Difference / Diferencia (cents): '+event.priceDifferenceCents
  ].join('\n');
}
module.exports={ALLOWED_FIELDS,diffBooking,buildModificationEvent,adminModificationMessage};

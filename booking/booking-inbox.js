'use strict';
const ALLOWED_PAYMENT = new Set(['later','coordinate']);
const ALLOWED_TIER = new Set(['luxury','comfort']);
function validateBookingRecord(b) {
 if (!b || typeof b !== 'object') throw new TypeError('Booking required');
 const required = ['reference','name','phone','email','from','to','date','time','payment','tier'];
 for (const k of required) if (typeof b[k] !== 'string' || !b[k].trim()) throw new TypeError('Invalid '+k);
 if (!/^PT-[A-Z0-9-]{4,64}$/.test(b.reference)) throw new TypeError('Invalid reference');
 if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.time)) throw new TypeError('Invalid pickup date/time');
 if (!ALLOWED_PAYMENT.has(b.payment) || !ALLOWED_TIER.has(b.tier)) throw new TypeError('Invalid booking options');
 if (!Number.isSafeInteger(b.fareCents) || b.fareCents < 0 || !Number.isSafeInteger(b.tipCents) || b.tipCents < 0) throw new TypeError('Invalid amounts');
 return true;
}
async function saveBookingRequest(db, b) {
 validateBookingRecord(b);
 if (!db || typeof db.query !== 'function') throw new TypeError('Database client required');
 const sql = `INSERT INTO booking_requests
 (reference, passenger_name, passenger_phone, passenger_email, pickup_address, destination_address,
 pickup_local_date, pickup_local_time, passenger_count, service_tier, fare_cents, tip_cents,
 payment_preference, special_instructions, status)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'received')
 ON CONFLICT (reference) DO NOTHING
 RETURNING id, reference, status, created_at`;
 const values = [b.reference,b.name.trim(),b.phone.trim(),b.email.trim(),b.from.trim(),b.to.trim(),
 b.date,b.time,b.passengers || null,b.tier,b.fareCents,b.tipCents,b.payment,b.details || null];
 const result = await db.query(sql, values);
 if (result.rowCount) return {created:true, booking:result.rows[0]};
 const existing = await db.query('SELECT id, reference, status, created_at FROM booking_requests WHERE reference=$1',[b.reference]);
 if (!existing.rowCount) throw new Error('Booking idempotency conflict unresolved');
 return {created:false, booking:existing.rows[0]};
}
module.exports={saveBookingRequest,validateBookingRecord};

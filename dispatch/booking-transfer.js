'use strict';
// Staging-only transactional dispatch creation. Caller MUST authenticate the
// server-to-server request before invoking this function.
async function createPendingTripFromBooking(db, payload) {
 if (!db || typeof db.connect !== 'function') throw new TypeError('Database pool required');
 const {booking_reference, passenger_surname, pickup_address, destination_address, pickup_at}=payload||{};
 if(typeof booking_reference!=='string'||!/^PT-[A-Z0-9-]{4,64}$/.test(booking_reference)||
    ![passenger_surname,pickup_address,destination_address].every(s=>typeof s==='string'&&s.trim().length>0&&s.length<=250)||
    typeof pickup_at!=='string'||!/(?:Z|[+-]\d{2}:\d{2})$/.test(pickup_at)||!Number.isFinite(Date.parse(pickup_at)))
   throw new TypeError('Invalid transfer payload');
 const client=await db.connect();
 try {
  await client.query('BEGIN');
  // ON CONFLICT handles retries and concurrent clicks via the unique index.
  const inserted=await client.query(
   "INSERT INTO dispatch_trips (booking_reference,passenger_surname,pickup_address,destination_address,pickup_at,status) VALUES ($1,$2,$3,$4,$5,'pending') ON CONFLICT (booking_reference) WHERE booking_reference IS NOT NULL DO NOTHING RETURNING id,status",
   [booking_reference,passenger_surname.trim(),pickup_address.trim(),destination_address.trim(),new Date(pickup_at).toISOString()]);
  let trip,created=false;
  if(inserted.rowCount){
   trip=inserted.rows[0];created=true;
   await client.query("INSERT INTO dispatch_audit(trip_id,actor_role,actor_id,action) VALUES($1,'system','booking-transfer','created_from_booking')",[trip.id]);
  }else{
   const existing=await client.query('SELECT id,status FROM dispatch_trips WHERE booking_reference=$1',[booking_reference]);
   if(!existing.rowCount)throw new Error('Transfer conflict not resolved');
   trip=existing.rows[0];
  }
  await client.query('COMMIT');
  return {id:trip.id,status:trip.status,created};
 }catch(e){await client.query('ROLLBACK');throw e}
 finally{client.release()}
}
module.exports={createPendingTripFromBooking};

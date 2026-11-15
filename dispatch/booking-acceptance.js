'use strict';
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function createAcceptanceMailer({apiKey,senderEmail,replyTo,fetchImpl=fetch}){
 if(!apiKey||!emailPattern.test(senderEmail||''))return null;
 return async b=>{
  const date=b.pickup_local_date instanceof Date?b.pickup_local_date.toISOString().slice(0,10):String(b.pickup_local_date).slice(0,10);
  const text=['RESERVA ACEPTADA / BOOKING ACCEPTED','Pimentel Transportation LLC','',
   'Hola / Hello '+b.passenger_name+',','Tu reserva ha sido aceptada por el administrador. / Your booking has been accepted by the administrator.',
   'Referencia / Reference: '+b.reference,'Fecha / Date: '+date,
   'Hora / Time: '+String(b.pickup_local_time).slice(0,5)+' (America/New_York)',
   'Recogida / Pickup: '+b.pickup_address,'Destino / Destination: '+b.destination_address,
   'Tarifa estimada / Estimated fare: $'+(b.fare_cents/100).toFixed(2)+' USD',
   'La asignación del conductor se gestiona por separado. / Driver assignment is handled separately.',
   'Esta confirmación no es un recibo de pago. / This confirmation is not a payment receipt.',
   'Contacto / Contact: +1 617-785-5657'].join('\n');
  const payload={sender:{name:'Pimentel Transportation LLC',email:senderEmail},to:[{email:b.passenger_email}],subject:'Reserva aceptada / Booking accepted — '+b.reference,textContent:text};
  if(emailPattern.test(replyTo||''))payload.replyTo={email:replyTo};
  const response=await fetchImpl('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json','api-key':apiKey},body:JSON.stringify(payload),signal:AbortSignal.timeout(12000)});
  if(!response.ok){const error=Error('Email provider rejected request');error.deliveryRejected=true;throw error}
  const result=await response.json();
  if(typeof result.messageId!=='string'||!result.messageId)throw Error('Email acknowledgement uncertain');
  return result.messageId;
 };
}
function registerAcceptanceRoute(r,{db,requireAdmin,sendAcceptance}){
 r.post('/:reference/accept-and-notify',requireAdmin,async(req,res,next)=>{
  const ref=req.params.reference;
  if(!/^PT-[A-Z0-9-]{4,64}$/.test(ref))return res.sendStatus(400);
  if(!sendAcceptance)return res.status(503).json({error:'El correo de aceptación no está configurado. La reserva no fue aprobada por este botón.'});
  let client,booking;
  try{
   client=await db.connect();await client.query('BEGIN');
   const result=await client.query('SELECT * FROM booking_requests WHERE reference=$1 FOR UPDATE',[ref]);
   booking=result.rows[0];
   const stop=async(status,error)=>{await client.query('ROLLBACK');return res.status(status).json({error})};
   if(!booking)return await stop(404,'Reserva no encontrada');
   if(booking.fare_cents===null)return await stop(409,'Define la tarifa antes de confirmar la reserva');
   if(booking.acceptance_notice_status==='sent'){await client.query('COMMIT');return res.json({accepted:true,notice:'sent',alreadySent:true})}
   if(['sending','unknown'].includes(booking.acceptance_notice_status))return await stop(409,'Envío en curso o incierto. Verifica el correo antes de volver a enviar.');
   if(booking.status!=='transferred'||!booking.dispatch_trip_id)return await stop(409,'Envía primero la reserva a despacho.');
   if(!emailPattern.test(booking.passenger_email||''))return await stop(400,'Correo del cliente inválido');
   const trip=await client.query('SELECT id,status FROM dispatch_trips WHERE id=$1 FOR UPDATE',[booking.dispatch_trip_id]);
   if(!trip.rows[0]||!['pending','approved','assigned','accepted'].includes(trip.rows[0].status))return await stop(409,'Este viaje no puede aceptarse en su estado actual.');
   if(trip.rows[0].status==='pending'){
    await client.query("UPDATE dispatch_trips SET status='approved',updated_at=NOW() WHERE id=$1",[booking.dispatch_trip_id]);
    await client.query("INSERT INTO dispatch_trip_audit(trip_id,actor_role,actor_id,action) VALUES($1,'admin',$2,'approved')",[booking.dispatch_trip_id,String(req.session.userId)]);
   }
   await client.query("UPDATE booking_requests SET acceptance_notice_status='sending',updated_at=NOW() WHERE reference=$1",[ref]);
   await client.query('COMMIT');
  }catch(e){if(client)await client.query('ROLLBACK').catch(()=>{});return next(e)}finally{if(client)client.release()}
  try{
   const messageId=await sendAcceptance(booking);
   await db.query("UPDATE booking_requests SET acceptance_notice_status='sent',acceptance_notice_sent_at=NOW(),acceptance_message_id=$2,updated_at=NOW() WHERE reference=$1",[ref,messageId]);
   res.json({accepted:true,notice:'sent'});
  }catch(e){
   // An uncertain provider response must never trigger an automatic duplicate email.
   const notice=e.deliveryRejected?'failed':'unknown';
   try{await db.query('UPDATE booking_requests SET acceptance_notice_status=$2,updated_at=NOW() WHERE reference=$1',[ref,notice])}catch{}
   res.status(502).json({accepted:true,notice,error:notice==='failed'?'Reserva aprobada, pero el proveedor rechazó el correo. Puedes reintentar.':'Reserva aprobada. El envío no pudo verificarse; revisa el correo antes de reenviar.'});
  }
 });
}
module.exports={createAcceptanceMailer,registerAcceptanceRoute};

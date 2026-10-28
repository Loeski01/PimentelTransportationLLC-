"use strict";
const SCHEMA=`CREATE TABLE IF NOT EXISTS dispatch_notifications(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 booking_id UUID NOT NULL REFERENCES bookings(id),
 assignment_id UUID REFERENCES assignments(id),
 kind VARCHAR(24) NOT NULL CHECK(kind IN ('admin_request','customer_request','driver_offer')),
 dedupe_key VARCHAR(120) NOT NULL UNIQUE,
 status VARCHAR(20) NOT NULL CHECK(status IN ('pending','sending','sent','failed','suppressed','obsolete')),
 attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 lease_until TIMESTAMPTZ,
 last_error_code VARCHAR(40),
 sent_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dispatch_notification_due ON dispatch_notifications(status,next_attempt_at);`;
async function ensureNotificationSchema(pool){
 const db=await pool.query("SELECT current_database() AS name");
 if(db.rows[0]?.name!=="pimentel_dispatch_dev")throw Error("Unexpected notification database");
 await pool.query(SCHEMA);
}
async function enqueueNotification(client,{bookingId,assignmentId=null,kind,enabled=false}){
 const dedupe=kind+":"+(assignmentId||bookingId);
 await client.query("INSERT INTO dispatch_notifications(booking_id,assignment_id,kind,dedupe_key,status) VALUES($1,$2,$3,$4,$5) ON CONFLICT(dedupe_key) DO NOTHING",
  [bookingId,assignmentId,kind,dedupe,enabled?"pending":"suppressed"]);
}
function notificationMessage(kind,booking,driver,{origin,adminEmail}){
 if(kind==="driver_offer")return {
  to:driver.email,subject:"Nueva asignación · Pimentel Transportation",
  text:"Tienes una nueva asignación. Entra a Pimentel App para revisarla y aceptar o rechazar.\n\n"+origin+"/conductores/"
 };
 const reference=booking.reference;
 const money=cents=>"$"+(cents/100).toFixed(2);
 const meta=booking.request_metadata||{};
 const tip=meta.tipPercent?Math.round(booking.estimated_fare_cents*meta.tipPercent/100):Number(meta.tipCents||0);

 if(kind==="customer_request")return {
  to:booking.customer_email,replyTo:adminEmail,
  subject:"Solicitud recibida · "+reference,
  text:["Gracias por elegir Pimentel Transportation LLC. Recibimos tu solicitud "+reference+".","Tu viaje NO está confirmado hasta que la empresa lo apruebe.","Recogida / Pickup: "+booking.pickup,"Destino / Destination: "+booking.destination,"Fecha y hora de Boston / Boston time: "+new Date(booking.pickup_at).toLocaleString("es-US",{timeZone:"America/New_York"}),"Tarifa estimada / Estimated fare: "+money(booking.estimated_fare_cents),"Propina opcional / Optional tip: "+money(tip),"Total estimado / Estimated total: "+money(booking.estimated_fare_cents+tip),"Thank you for your request. Your ride is NOT confirmed until our company approves it."].join("\n")
 };
 return {
  to:adminEmail,replyTo:booking.customer_email,subject:"Nueva solicitud pendiente · "+reference,
  text:[reference,booking.customer_name,booking.customer_email,booking.customer_phone,
   "Recogida: "+booking.pickup,"Destino: "+booking.destination,
   "Fecha de Boston: "+new Date(booking.pickup_at).toLocaleString("es-US",{timeZone:"America/New_York"}),
   "Pasajeros: "+(meta.passengers||"Revisar"),"Notas: "+(meta.details||"Sin notas"),
   "Tarifa estimada: "+money(booking.estimated_fare_cents),"Propina: "+money(tip),
   "Pendiente de tu aprobación.",origin+"/despacho"].join("\n")
 };
}
function createNotificationWorker({pool,sendEmail,origin,adminEmail,enabled=false}){
 let running=false,stopped=false;
 async function runOnce(){
  if(!enabled||running||stopped)return false;
  running=true;
  let job,providerAccepted=false;
  try{
   await pool.query("UPDATE dispatch_notifications SET status='failed',lease_until=NULL,last_error_code='DELIVERY_UNKNOWN' WHERE status='sending' AND lease_until<=now() AND (attempts>=6 OR lease_until<=now()-interval '25 minutes')");
   const result=await pool.query(`WITH candidate AS (
    SELECT id FROM dispatch_notifications
    WHERE ((status='pending' AND next_attempt_at<=now()) OR (status='sending' AND lease_until<=now())) AND attempts<6
    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
   ) UPDATE dispatch_notifications n SET status='sending',attempts=n.attempts+1,lease_until=now()+interval '2 minutes'
   FROM candidate c WHERE n.id=c.id RETURNING n.*`);
   job=result.rows[0];if(!job)return false;
   const booking=(await pool.query("SELECT * FROM bookings WHERE id=$1",[job.booking_id])).rows[0];
   let driver;
   if(job.kind==="driver_offer"){
    const row=(await pool.query("SELECT d.email FROM assignments a JOIN drivers d ON d.id=a.driver_id WHERE a.id=$1 AND a.status='offered' AND d.active=true AND d.pin_configured=true",[job.assignment_id])).rows[0];
    if(!row||booking?.status!=="assigned"){
     await pool.query("UPDATE dispatch_notifications SET status='obsolete',lease_until=NULL WHERE id=$1",[job.id]);return true;
    }driver=row;
   }
   if(!booking)throw Error("BOOKING_UNAVAILABLE");
   const message=notificationMessage(job.kind,booking,driver,{origin,adminEmail});
   await sendEmail({...message,idempotencyKey:job.id});providerAccepted=true;
   await pool.query("UPDATE dispatch_notifications SET status='sent',sent_at=now(),lease_until=NULL,last_error_code=NULL WHERE id=$1 AND status='sending' AND attempts=$2",[job.id,job.attempts]);
   return true;
  }catch(error){
   if(job){
    const uncertain=providerAccepted||error.deliveryUncertain;
    await pool.query("UPDATE dispatch_notifications SET status=$1,lease_until=NULL,last_error_code=$2,next_attempt_at=now()+($3*interval '1 minute') WHERE id=$4 AND status='sending' AND attempts=$5",
     [uncertain||error.permanent||job.attempts>=6?"failed":"pending",uncertain?"DELIVERY_UNKNOWN":"DELIVERY_FAILED",Math.min(30,2**(job.attempts-1)),job.id,job.attempts]).catch(()=>{});
   }
   console.error("Dispatch notification attempt failed");
   return false;
  }finally{running=false;}
 }
 const timer=enabled?setInterval(()=>runOnce(),30000):null;timer?.unref();
 return {runOnce,stop(){stopped=true;if(timer)clearInterval(timer);}};
}
module.exports={SCHEMA,ensureNotificationSchema,enqueueNotification,notificationMessage,createNotificationWorker};

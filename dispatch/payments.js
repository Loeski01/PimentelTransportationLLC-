"use strict";
const {createIntakeHandler}=require("./booking-intake");
const {INTEGRATION_IDENTIFIER}=require("./stripe-config");
function dueAmount(booking){
 const meta=booking.request_metadata||{};
 const tip=meta.tipPercent?Math.round(booking.estimated_fare_cents*meta.tipPercent/100):Number(meta.tipCents||0);
 return {fare:booking.estimated_fare_cents,tip,total:booking.estimated_fare_cents+tip};
}
function createDispatchCheckout({pool,stripe,calculateFare,origin,now=Date.now}){
 return createIntakeHandler({pool,calculateFare,now,allowPayNow:true,afterPersisted:async({id,reference,request})=>{
  const error=message=>Object.assign(Error(message),{status:409});
  if(request.payment!=="now")throw error("Selecciona pago con tarjeta para abrir Stripe.");
  const booking=(await pool.query("SELECT * FROM bookings WHERE id=$1",[id])).rows[0];
  const meta=booking.request_metadata||{};
  if(booking.status!=="pending"||meta.payment_status==="paid")throw error("Esta solicitud ya cambió de estado. Revisa el panel antes de pagar.");
  const age=now()-Date.parse(meta.requestedAt);
  if(!Number.isFinite(age)||age>30*60*1000)throw error("La cotización de pago venció. Inicia una solicitud nueva.");
  const amounts=dueAmount(booking);
  const items=[{price_data:{currency:"usd",unit_amount:amounts.fare,product_data:{name:"Pimentel Transportation · Traslado privado"}},quantity:1}];
  if(amounts.tip>0)items.push({price_data:{currency:"usd",unit_amount:amounts.tip,product_data:{name:"Optional gratuity / Propina voluntaria"}},quantity:1});
  const session=await stripe.checkout.sessions.create({
   mode:"payment",integration_identifier:INTEGRATION_IDENTIFIER,line_items:items,customer_email:booking.customer_email,expires_at:Math.floor(now()/1000)+31*60,
   automatic_tax:{enabled:false},allow_promotion_codes:false,
   metadata:{purpose:"pimentel_dispatch",bookingId:id,reference},
   success_url:origin+"/solicitar?payment=returned",cancel_url:origin+"/solicitar?payment=cancelled"
  },{idempotencyKey:"dispatch-checkout:"+id});
  const url=new URL(session.url);
  if(url.protocol!=="https:"||url.hostname!=="checkout.stripe.com")throw Error("Unexpected checkout destination");
  await pool.query("UPDATE bookings SET request_metadata=request_metadata||$1::jsonb WHERE id=$2 AND request_metadata->>'payment_status' IS DISTINCT FROM 'paid'",
   [JSON.stringify({stripe_session_id:session.id,payment_status:"awaiting_payment",payment_total_cents:amounts.total}),id]);
  return {url:url.href,reference,received:true,pendingApproval:true};
 }});
}
function createDispatchWebhook({pool,stripe,webhookSecret,testOnly=true}){
 return async(req,res)=>{
  res.set("Cache-Control","no-store");
  let event;
  try{event=stripe.webhooks.constructEvent(req.body,req.get("stripe-signature"),webhookSecret);}
  catch(error){return res.status(400).json({error:"Firma de Stripe inválida"});}
  if(testOnly&&event.livemode!==false)return res.status(400).json({error:"Solo se permiten eventos de prueba"});
  const session=event.data?.object;
  if(session?.metadata?.purpose!=="pimentel_dispatch")return res.json({received:true,ignored:true});
  const id=session.metadata.bookingId;
  if(typeof id!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))return res.status(400).json({error:"Identificador de viaje inválido"});
  const paid=["checkout.session.completed","checkout.session.async_payment_succeeded"].includes(event.type)&&session.payment_status==="paid";
  const failed=event.type==="checkout.session.async_payment_failed";
  const expired=event.type==="checkout.session.expired";
  if(!paid&&!failed&&!expired)return res.json({received:true,ignored:true});
  const client=await pool.connect();
  try{
   await client.query("BEGIN");
   const booking=(await client.query("SELECT * FROM bookings WHERE id=$1 FOR UPDATE",[id])).rows[0];
   if(!booking){await client.query("ROLLBACK");return res.status(409).json({error:"Solicitud no localizada"});}
   const meta=booking.request_metadata||{};
   if(meta.payment!=="now"||meta.stripe_session_id!==session.id||session.currency!=="usd"||session.amount_total!==dueAmount(booking).total){
    await client.query("ROLLBACK");return res.status(409).json({error:"El pago no coincide con el viaje"});
   }
   const state=paid?"paid":failed?"failed":"expired";
   if(meta.payment_status!=="paid"&&meta.payment_status!==state){
    await client.query("UPDATE bookings SET request_metadata=request_metadata||$1::jsonb WHERE id=$2",[JSON.stringify({payment_status:state,stripe_event_id:event.id}),id]);
    await client.query("INSERT INTO dispatch_audit(booking_id,actor_role,actor_id,action) VALUES($1,'system','stripe',$2)",[id,"payment_"+state]);
   }
   await client.query("COMMIT");res.json({received:true});
  }catch(error){await client.query("ROLLBACK");console.error("Dispatch payment event failed",error.code||"EVENT_FAILED");res.status(503).json({error:"No se pudo registrar el evento"});}
  finally{client.release();}
 };
}
module.exports={dueAmount,createDispatchCheckout,createDispatchWebhook};

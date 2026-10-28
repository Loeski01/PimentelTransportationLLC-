"use strict";
const crypto = require("node:crypto");
const {bostonDateTime}=require("./public/time");
const {enqueueNotification}=require("./notifications");
async function ensureIntakeSchema(pool,expectedDatabase="pimentel_dispatch_dev") {
  const result=await pool.query("SELECT current_database() AS name");
  if(result.rows[0]?.name!==expectedDatabase)throw new Error("Unexpected intake database");
  await pool.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS request_metadata JSONB NOT NULL DEFAULT '{}'::jsonb");
}
function createIntakeHandler({pool,calculateFare,now=Date.now}) {
  const limits=new Map();
  const fail=(res,status,error)=>res.status(status).json({error});
  const text=(value,max)=>typeof value==="string"&&value.trim()&&value.length<=max;
  return async(req,res)=>{
    res.set("Cache-Control","no-store");
    const b=req.body||{};
    const pickup=bostonDateTime(b.date,b.time);
    const tipPercent=Number(b.tipPercent??0),tipCents=Number(b.tipCents??0);
    const passengers=b.passengers==="6 or more"?"6 or more":Number(b.passengers);
    if(!text(b.name,100)||!text(b.phone,40)||!text(b.email,254)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)||
       !text(b.from,200)||!text(b.to,200)||!pickup||pickup.getTime()<=now()||
       (passengers!=="6 or more"&&(!Number.isInteger(passengers)||passengers<1||passengers>6))||
       !Number.isSafeInteger(b.expectedFareCents)||b.expectedFareCents<0||b.expectedFareCents>100000000||
       ![0,10,15,20].includes(tipPercent)||!Number.isSafeInteger(tipCents)||tipCents<0||tipCents>100000||
       (tipPercent>0&&tipCents>0)||!["later","coordinate"].includes(b.payment)||
       (b.details!==undefined&&(typeof b.details!=="string"||b.details.length>500))||
       typeof b.requestId!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(b.requestId))
      return fail(res,400,"Revisa los datos, la fecha y la hora de Boston. Las horas ambiguas por cambio de horario requieren coordinación.");
    for(const [ip,item] of limits)if(item.expires<=now())limits.delete(ip);
    const ip=String(req.ip||"unknown"),limit=limits.get(ip)||{count:0,expires:now()+60000};
    if(limit.count>=8||(!limits.has(ip)&&limits.size>=10000))return fail(res,429,"Espera un minuto antes de enviar más solicitudes.");
    limit.count++;limits.set(ip,limit);
    const values=[b.name.trim(),b.email.trim().toLowerCase(),b.phone.trim(),b.from.trim(),b.to.trim(),pickup.toISOString(),b.expectedFareCents];
    const metadata={source:"web",passengers,details:(b.details||"").trim(),payment:b.payment,tipPercent,tipCents,timeZone:"America/New_York"};
    metadata.requestHash=crypto.createHash("sha256").update(JSON.stringify([values,metadata])).digest("hex");
    const reference="WEB-"+b.requestId.toUpperCase();
    function response(row){
      if(row.request_metadata?.requestHash!==metadata.requestHash)return fail(res,409,"Esta solicitud ya se envió con otros datos. Inicia una solicitud nueva.");
      return res.json({reference,received:true,customerNoticeSent:false,notificationStatus:process.env.ENABLE_DISPATCH_EMAIL_NOTIFICATIONS==="true"?"queued":"disabled",pendingApproval:row.status==="pending"});
    }
    try{
      const previous=await pool.query("SELECT status,request_metadata FROM bookings WHERE reference=$1",[reference]);
      if(previous.rows[0])return response(previous.rows[0]);
      const fare=await calculateFare(values[3],values[4]);
      if(fare.amount!==b.expectedFareCents)return fail(res,409,"La tarifa cambió. Calcula nuevamente antes de enviar.");
      const client=await pool.connect();
      try{
        await client.query("BEGIN");
        const saved=await client.query("INSERT INTO bookings(reference,customer_name,customer_email,customer_phone,pickup,destination,pickup_at,estimated_fare_cents,request_metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) ON CONFLICT(reference) DO NOTHING RETURNING id,status,request_metadata",[reference,...values,JSON.stringify(metadata)]);
        if(saved.rows[0]){
          await client.query("INSERT INTO dispatch_audit(booking_id,actor_role,actor_id,action) VALUES($1,'customer','web','requested')",[saved.rows[0].id]);
          for(const kind of ["admin_request","customer_request"])await enqueueNotification(client,{bookingId:saved.rows[0].id,kind,enabled:process.env.ENABLE_DISPATCH_EMAIL_NOTIFICATIONS==="true"});
          await client.query("COMMIT");
          return response(saved.rows[0]);
        }
        const existing=await client.query("SELECT status,request_metadata FROM bookings WHERE reference=$1",[reference]);
        await client.query("COMMIT");return response(existing.rows[0]);
      }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
    }catch(error){
      console.error("Booking intake failed",error.code||"REQUEST_FAILED");
      if([422,503,504].includes(error.status))return fail(res,error.status,error.message);
      return fail(res,503,"No se pudo guardar la solicitud. Intenta nuevamente con los mismos datos.");
    }
  };
}
module.exports={bostonDateTime,ensureIntakeSchema,createIntakeHandler};

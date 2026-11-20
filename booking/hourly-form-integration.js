'use strict';
/**
 * Hourly booking integration. Load as a deferred script after the existing
 * calculator code; it intercepts hourly submissions in capture phase.
 * The legacy WhatsApp/email action remains available only as an explicit
 * fallback if the server cannot verify dispatch persistence.
 */
(function(){
 const bodyTier=()=>document.querySelector('input[name="tier"]:checked')?.value||'luxury';
 const form=document.getElementById('unifiedForm');
 if(!form)return;
 const el=id=>document.getElementById(id);
 const value=id=>el(id)?.value?.trim()||'';
 const API=(window.PIMENTEL_BOOKING_API_ORIGIN||'https://pimenteltransportationllc.onrender.com').replace(/\/$/,'');
 let busy=false;
 form.addEventListener('submit',async function(event){
   if(value('serviceType')!=='hourly')return;
   event.preventDefault();
   event.stopImmediatePropagation();
   if(busy)return;
   const status=el('bookingStatus'),button=el('submitBooking'),fallback=el('envios');
   if(!form.reportValidity())return;
   const hours=Number(value('hours'));
   const tipChoice=value('tip'),tipPercent=tipChoice==='custom'?0:Number(tipChoice);
   const tipCents=tipChoice==='custom'?Math.round(Number(value('tipAmount'))*100):0;
   if(!Number.isFinite(hours)||hours<(bodyTier()==='comfort'?2:3)||hours>24||Math.round(hours*4)!==hours*4||
     ![0,10,15,20].includes(tipPercent)||!Number.isSafeInteger(tipCents)||tipCents<0){
     status.textContent='Review hours and tip / Revisa las horas y la propina.';return;
   }
   const body={name:value('nombre'),email:value('email'),phone:value('telefono'),
     from:value('origen'),itinerary:value('destino'),date:value('fecha'),time:value('hora'),
     passengers:value('pasajeros'),details:value('detalles'),tier:bodyTier(),
     hours,tipPercent,tipCents};
   // The tier is selected by the existing calculator; its helper is private.
   const tierChoice=document.querySelector('input[name="tier"]:checked, select[name="tier"]');
   if(tierChoice)body.tier=tierChoice.value;
   busy=true;button.disabled=true;fallback.hidden=true;fallback.style.display='none';
   status.textContent='Submitting hourly request / Enviando solicitud por horas...';
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
   try{
     const response=await fetch(API+'/api/hourly-booking-request',{
       method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal
     });
     const result=await response.json();
     if(!response.ok||result.received!==true||!/^PT-[A-Z0-9-]+$/.test(result.reference||''))
       throw Error(result.error||'Dispatch receipt not verified');
     status.textContent='Request received / Solicitud recibida: '+result.reference+
       '. Pending company approval; no payment collected. / Pendiente de aprobación; sin cobro.';
   }catch(error){
     status.textContent='Dispatch receipt NOT verified. Contact the company before resubmitting. / Recepción NO verificada. Contacta a la empresa antes de reenviar.';
   }finally{clearTimeout(timer);busy=false;button.disabled=false;}
 },true);
})();

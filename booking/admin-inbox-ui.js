'use strict';
// UI helpers for the private, staging-only booking inbox.
function bookingAction(status) {
  if (status==='received') return {label:'Enviar a despacho',enabled:true};
  if (status==='transferring') return {label:'Transferencia en revisión',enabled:false};
  if (status==='transferred') return {label:'Enviado a despacho',enabled:false};
  return {label:'No disponible',enabled:false};
}
function validReference(reference) {
  return typeof reference==='string' && /^PT-[A-Z0-9-]{4,64}$/.test(reference);
}
if(typeof module!=='undefined'&&module.exports)module.exports={bookingAction,validReference};
if(typeof window!=='undefined'){
 const list=document.getElementById('booking-list');
 const notice=document.getElementById('booking-notice');
 const refresh=document.getElementById('booking-refresh');
 const apiRoot='/admin/booking/';
 const message=value=>{notice.textContent=value};
 const text=(tag,value)=>{const e=document.createElement(tag);e.textContent=String(value??'');return e};
 const load=async()=>{
  message('Consultando reservas...');
  const response=await fetch(apiRoot,{credentials:'same-origin',cache:'no-store'});
  if(!response.ok)throw new Error('No fue posible consultar las reservas ('+response.status+')');
  const records=await response.json();
  if(!Array.isArray(records))throw new Error('Respuesta de reservas no válida');
  list.replaceChildren();
  for(const row of records){
   if(!validReference(row.reference))continue;
   const card=text('article','');
   card.className='booking';
   card.append(text('h2',row.reference));
   card.append(text('p',(row.passenger_name||'Pasajero')+' — '+(row.pickup_local_date||'')+' '+String(row.pickup_local_time||'').slice(0,5)));
   card.append(text('p',(row.pickup_address||'')+' → '+(row.destination_address||'')));
   card.append(text('p','Estado: '+row.status));
   const action=bookingAction(row.status);
   const button=text('button',action.label);
   button.disabled=!action.enabled;
   if(action.enabled)button.addEventListener('click',async()=>{
    if(!window.confirm('¿Enviar la reserva '+row.reference+' a despacho?'))return;
    button.disabled=true;message('Enviando...');
    try{
     const result=await fetch(apiRoot+encodeURIComponent(row.reference)+'/send-to-dispatch',{
      method:'POST',credentials:'same-origin',cache:'no-store',
      headers:{'Content-Type':'application/json'}
     });
     if(!result.ok)throw new Error('Transferencia no confirmada ('+result.status+'). No repitas el envío sin revisar el estado.');
     await load();
     message('Transferencia registrada. El viaje queda pendiente de aprobación.');
    }catch(error){message(error.message);button.disabled=true;}
   });
   card.append(button);list.append(card);
  }
  message(records.length?('Reservas consultadas: '+records.length):'No hay reservas todavía.');
 };
 refresh.addEventListener('click',()=>load().catch(e=>message(e.message)));
 load().catch(e=>message(e.message));
}

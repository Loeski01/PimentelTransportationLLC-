'use strict';
const ADMIN_PHONE = '16177855657';
function createAdminSms({enabled=false,apiKey,sender,fetchImpl=fetch}={}) {
  return async function notify(reference) {
    if (!enabled) return {status:'disabled'};
    if (!apiKey || !/^(?:[a-zA-Z0-9]{1,11}|[0-9]{12,15})$/.test(sender || ''))
      return {status:'configuration_missing'};
    if (!/^PT-[A-Z0-9-]{4,64}$/.test(reference)) throw Error('Invalid booking reference');
    const content = 'Pimentel Transportation: Nueva reserva '+reference+'. Revisa tu correo y panel. Pendiente de tu aprobacion.';
    try {
      const response = await fetchImpl('https://api.brevo.com/v3/transactionalSMS/send',{
        method:'POST',
        headers:{'Content-Type':'application/json','Accept':'application/json','api-key':apiKey},
        body:JSON.stringify({sender,recipient:ADMIN_PHONE,content,type:'transactional'}),
        signal:AbortSignal.timeout(12000)
      });
      if (!response.ok) return {status:response.status>=500?'unknown':'rejected'};
      const result=await response.json();
      if (!(typeof result.messageId==='string' && result.messageId) &&
          !(Number.isSafeInteger(result.messageId) && result.messageId>0)) return {status:'unknown'};
      return {status:'submitted'};
    } catch { return {status:'unknown'}; }
    // Never retry automatically: an uncertain response can still consume credits.
  };
}
module.exports={createAdminSms};

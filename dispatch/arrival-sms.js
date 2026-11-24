'use strict';
// Brevo SMS transport. No message is sent unless explicitly invoked by the server.
// The caller must enforce one notification per trip using a durable database record.
function normalizeUsPhone(value) {
  const digits=String(value||'').replace(/\D/g,'');
  if(digits.length===10)return '+1'+digits;
  if(digits.length===11&&digits[0]==='1')return '+'+digits;
  return null;
}
function createArrivalSmsSender({apiKey, sender='Pimentel', fetchImpl=globalThis.fetch}={}) {
  return async function sendArrivalSms({phone, pickupAddress}={}) {
    if(!apiKey)throw new Error('Brevo SMS API key not configured');
    const recipient=normalizeUsPhone(phone);
    if(!recipient)throw new Error('Invalid passenger phone');
    if(typeof fetchImpl!=='function')throw new Error('SMS transport unavailable');
    const address=String(pickupAddress||'').trim().slice(0,160);
    const content='Your driver has arrived at the pickup location'+(address?' ('+address+')':'')+'. Please meet your driver when ready. Pimentel Transportation LLC.';
    const response=await fetchImpl('https://api.brevo.com/v3/transactionalSMS/sms',{
      method:'POST',
      headers:{'api-key':apiKey,'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify({type:'transactional',unicodeEnabled:false,sender,recipient,content})
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error('Brevo SMS request failed: HTTP '+response.status);
    return {messageId:result.messageId||null,recipient,status:'accepted'};
  };
}
module.exports={normalizeUsPhone,createArrivalSmsSender};

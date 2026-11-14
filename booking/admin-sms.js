'use strict';
const ADMIN_PHONE='16177855657';
function createAdminSmsSender({enabled=false,apiKey,sender,recipient=ADMIN_PHONE,fetchImpl=fetch}){
 if(enabled!==true)return null;
 const to=String(recipient).replace(/^\+/,'');
 const from=typeof sender==='string'?sender.replace(/^\+/,''):'';
 if(!apiKey||!from||!/^([A-Za-z][A-Za-z0-9]{2,10}|[0-9]{6,15})$/.test(from))throw Error('Registered SMS sender and API credentials required');
 if(to!==ADMIN_PHONE)throw Error('SMS destination must match the owner notification number');
 return async({reference,date,time})=>{
  if(!/^PT-[A-Z0-9-]{4,64}$/.test(reference||'')||!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time||''))throw Error('Invalid booking notice');
  const content='Pimentel: nueva reserva '+reference+' para '+date+' '+time+' Boston. Abre tu panel para revisar y asignar.';
  if(content.length>160||!/^[\x20-\x7E]+$/.test(content))throw Error('SMS notice must fit one plain-text segment');
  const response=await fetchImpl('https://api.brevo.com/v3/transactionalSMS/send',{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'api-key':apiKey,'Accept':'application/json','Content-Type':'application/json'},body:JSON.stringify({sender:from,recipient:to,content,type:'transactional',tag:reference,unicodeEnabled:false})});
  if(!response.ok)throw Error('SMS provider did not accept the notification');
  const ack=await response.json();
  if(!ack||!['string','number'].includes(typeof ack.messageId)||!String(ack.messageId))throw Error('SMS acknowledgement uncertain; check provider before retrying');
  return {accepted:true,messageId:ack.messageId};
 };
}
module.exports={createAdminSmsSender,ADMIN_PHONE};

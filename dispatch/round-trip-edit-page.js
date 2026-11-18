'use strict';

const form=document.querySelector('#edit');
const status=document.querySelector('#status');
const params=new URLSearchParams(location.hash.slice(1));
const reference=params.get('reference');
const version=Number(params.get('version'));
const token=params.get('token');
history.replaceState(null,'',location.pathname);

if(!/^PT-[A-Z0-9-]{4,64}$/.test(reference||'') || !Number.isSafeInteger(version) || version<1 || !token){
  status.textContent='Open your booking edit link. / Abre tu enlace para modificar la reserva.';
}else{
  form.hidden=false;
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const button=form.querySelector('button');
    if(button.disabled)return;
    const patch=Object.fromEntries([...new FormData(form)].filter(([,value])=>value));
    if(!Object.keys(patch).length){
      status.textContent='Enter a date or time to change. / Ingresa una fecha u hora para cambiar.';
      return;
    }
    button.disabled=true;
    try{
      const response=await fetch(encodeURIComponent(reference)+'/edit',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({token,version,patch})
      });
      if(response.ok){
        form.hidden=true;
        status.textContent='Change saved. / Cambio guardado.';
      }else if(response.status===400){
        button.disabled=false;
        status.textContent='Check the new schedule. / Revisa el nuevo horario.';
      }else{
        status.textContent='Contact Pimentel Transportation to verify your booking. / Contacta a Pimentel Transportation para verificar tu reserva.';
      }
    }catch{
      status.textContent='Contact Pimentel Transportation to verify your booking. / Contacta a Pimentel Transportation para verificar tu reserva.';
    }
  });
}

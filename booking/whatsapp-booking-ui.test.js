'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
function browserRequest(ok=true){
 let handler,calls=0;
 const values={serviceType:'transfer',nombre:'Test Passenger',telefono:'+16175550123',email:'test@example.com',origen:'Boston',destino:'Woburn',fecha:'2026-11-20',hora:'14:30',pasajeros:'1',detalles:'TEST',pago:'later'};
 const nodes={};for(const id of [...Object.keys(values),'unifiedForm','submitBooking','bookingStatus','envios','whatsapp','correo'])nodes[id]={value:values[id]||'',textContent:'',href:'',hidden:true,style:{display:'none'},disabled:false,scrollIntoView(){},addEventListener(type,fn){if(type==='submit')handler=fn}};
 const start=html.indexOf("el('unifiedForm').addEventListener('submit',async event=>{");
 const end=html.indexOf('\n</script>',start);
 const script=html.slice(start,end);
 vm.runInNewContext(script,{el:id=>nodes[id],quote:{from:'Boston',to:'Woburn',tier:'luxury',amount:8000},selectedTier:()=> 'luxury',tierName:()=> 'Executive Black SUV',tipData:()=>({tipPercent:0,tipCents:0}),money:cents=>'$'+(cents/100).toFixed(2),API:'https://example.invalid',AbortController,setTimeout,clearTimeout,encodeURIComponent,
 fetch:async()=>{calls++;return {ok,json:async()=>ok?{reference:'PT-TEST2026',received:true,customerNoticeSent:true}:{error:'Unavailable'}}}});
 return {nodes,run:()=>handler({preventDefault(){}}),get calls(){return calls}};
}
test('saved request keeps WhatsApp contact visible and includes stored reference',async()=>{const b=browserRequest();await b.run();assert.equal(b.calls,1);assert.equal(b.nodes.envios.hidden,false);assert.equal(b.nodes.envios.style.display,'block');const link=new URL(b.nodes.whatsapp.href);assert.equal(link.hostname,'wa.me');assert.equal(link.pathname,'/16177855657');assert.match(link.searchParams.get('text'),/PT-TEST2026/);assert.match(b.nodes.bookingStatus.textContent,/Solicitud recibida/);assert.equal(b.nodes.submitBooking.disabled,false)});
test('failed automatic delivery still offers the same WhatsApp destination',async()=>{const b=browserRequest(false);await b.run();assert.equal(b.nodes.envios.hidden,false);assert.equal(new URL(b.nodes.whatsapp.href).pathname,'/16177855657');assert.equal(b.nodes.submitBooking.disabled,false)});
test('customer voice calls keep the published primary number',()=>{assert.match(html,/href="tel:\+16175188281"/);assert.match(html,/href="https:\/\/wa\.me\/16177855657"/)});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function backend(fetch, stripeCreate){
 const routes={}; const app={use(){},get(){},post(path,fn){routes[path]=fn;},listen(){}};
 const express=()=>app; express.json=()=>()=>{};
 const context=vm.createContext({require:n=>n==='express'?express:n==='stripe'?function(){return {checkout:{sessions:{create:stripeCreate}}};}:{setTimeout:async()=>{}},fetch,AbortSignal,URL,console,process:{env:stripeCreate?{STRIPE_SECRET_KEY:'sk_test_mock'}:{}}});
 vm.runInContext(fs.readFileSync('server.js','utf8'),context);
 return async(body,path='/api/quote')=>{let status=200,data;const res={setHeader(){},status(n){status=n;return this;},json(d){data=d;}}; await routes[path]({body},res);return {status,data};};
}
const place={lat:'42',lon:'-71',display_name:'Boston'};
test('quote computes cents, caches repeated requests and rejects invalid input',async()=>{
 let calls=0; const quote=backend(async()=>({ok:true,json:async()=>++calls<=2?[place]:{code:'Ok',routes:[{distance:16093.44,duration:1200}]}}));
 const first=await quote({from:'Boston',to:'Woburn'});
 assert.equal(first.status,200);assert.equal(first.data.amount,8000);
 assert.equal((await quote({from:'Boston',to:'Woburn'})).data.amount,8000);assert.equal(calls,3);
 assert.equal((await quote({from:'',to:'Woburn'})).status,400);
});
test('Comfort and Luxury tiers quote independently and reject unknown categories',async()=>{
 const service=()=>{let calls=0;return backend(async()=>({ok:true,json:async()=>++calls<=2?[place]:{code:'Ok',routes:[{distance:16093.44,duration:1200}]}}));};
 const luxury=await service()({from:'Boston',to:'Woburn',tier:'luxury'});
 const comfort=await service()({from:'Boston',to:'Woburn',tier:'comfort'});
 assert.equal(luxury.status,200);assert.equal(luxury.data.amount,8000);
 assert.equal(comfort.status,200);assert.equal(comfort.data.amount,6450);
 assert.equal(comfort.data.tier,'comfort');
 assert.equal((await service()({from:'Boston',to:'Woburn',tier:'unknown'})).status,400);
});
test('missing address, provider failure, timeout, no route, malformed route are explicit errors',async()=>{
 for(const [fetch,status,code] of [
 [async()=>({ok:true,json:async()=>[]}),422,'ADDRESS_NOT_FOUND'],
 [async()=>({ok:false}),503,'MAP_UNAVAILABLE'],
 [async()=>{throw Object.assign(new Error(),{name:'TimeoutError'});},504,'QUOTE_TIMEOUT'],
 ...[{code:'NoRoute'},{code:'Ok',routes:[{distance:null,duration:2}]}].map(route=>{
 let calls=0;return [async()=>({ok:true,json:async()=>++calls<=2?[place]:route}),route.code==='NoRoute'?422:502,route.code==='NoRoute'?'NO_ROUTE':'MAP_ERROR'];})
 ]) {const result=await backend(fetch)({from:'A',to:'B'});assert.equal(result.status,status);assert.equal(result.data.code,code);}
});
function frontend(fetch,location={}){
 const elements={};const element=id=>elements[id]??=( {value:({from:'Boston',to:'Woburn',tipChoice:'0',tripType:'one_way',paymentKind:'ride',customerName:'Test rider',phone:'6175550100'})[id]||'',style:{},setAttribute(name,value){this[name]=value;},addEventListener(event,fn){this[event]=fn;}} );
 const context=vm.createContext({document:{getElementById:element},fetch,window:{location:{search:'',...location,assign(url){elements.redirect=url;}}},URL,AbortController,AbortSignal,URLSearchParams,Intl,TypeError,setTimeout,clearTimeout});
 vm.runInContext(fs.readFileSync('calculadora-gps-pimentel.html','utf8').split('<script>')[1].split('</script>')[0],context);
 return {elements,element};
}
test('browser uses only backend, renders result and restores button',async()=>{
 const {element}=frontend(async(url,opts)=>{assert.equal(url,'https://pimenteltransportationllc.onrender.com/api/quote');assert.equal(opts.method,'POST');return {ok:true,json:async()=>({miles:10,minutes:20,base:35,mileage:35,time:10,airportFee:0,amount:8000})};});
 await element('calculate').click();assert.equal(element('total').textContent,'$80.00');assert.equal(element('calculate').disabled,false);
});
test('browser restores button and hides result on timeout, network, backend and malformed responses',async()=>{
 for(const fetch of [async()=>{throw Object.assign(new Error(),{name:'AbortError'});},async()=>{throw new TypeError();},async()=>({ok:false,json:async()=>({error:'No route'})}),async()=>({ok:true,json:async()=>({})})]){
 const {element}=frontend(fetch);await element('calculate').click();assert.equal(element('calculate').disabled,false);assert.equal(element('result').style.display,'none');assert.equal(element('status').className,'status error');
 }
});
test('server passes one shared 10 second deadline through all map calls',async()=>{
 const signals=[];let calls=0;
 const quote=backend(async(_,opts)=>{signals.push(opts.signal);return {ok:true,json:async()=>++calls<=2?[place]:{code:'Ok',routes:[{distance:0,duration:0}]}};});
 assert.equal((await quote({from:'A',to:'B'})).status,200);
 assert.equal(signals.length,3);assert.ok(signals.every(signal=>signal===signals[0]));
});

test('pay-later link preserves addresses and selects the booking preference',async()=>{
 const {element}=frontend(async()=>({ok:true,json:async()=>({miles:10,minutes:20,base:35,mileage:35,time:10,airportFee:0,amount:8000})}));
 await element('calculate').click();
 const url=new URL(element('payLater').href);
 assert.equal(url.searchParams.get('payment'),'after_trip');
 assert.equal(url.searchParams.get('from'),'Boston');
 assert.equal(url.hash,'#reserva');
});
test('unified booking has selectable tiers, separate contact links and payment options',()=>{
 const html=fs.readFileSync('index.html','utf8');
 assert.match(html,/name="tier" value="luxury" checked/);
 assert.match(html,/name="tier" value="comfort"/);
 assert.match(html,/id="unifiedForm"/);
 assert.match(html,/tier:selectedTier\(\)/);
 assert.match(html,/value="later">Pay after trip \/ Pagar al finalizar/);
 assert.match(html,/href="tel:\+16175188281"/);
 assert.match(html,/href="sms:\+16177855657"/);
});

const sampleQuote={miles:10,minutes:20,base:35,mileage:35,time:10,airportFee:0,amount:8000};
const booking={from:'Boston',to:'Woburn',customerName:'Test rider',phone:'6175550100',expectedFareCents:8000};
function paymentBackend(create){let count=0;return backend(async()=>({ok:true,json:async()=>++count<=2?[place]:{code:'Ok',routes:[{distance:16093.44,duration:1200}]}}),create);}
test('Stripe calculates percentages and custom tips server-side and tip-only never charges the ride',async()=>{
 for(const [tip,kind,expected] of [[{tipPercent:0},'ride',[8000]],[{tipPercent:10},'ride',[8000,800]],[{tipPercent:15},'ride',[8000,1200]],[{tipPercent:20},'ride',[8000,1600]],[{tipCents:1234},'ride',[8000,1234]],[{tipCents:1234},'tip_only',[1234]]]){
  let session;
  const request=paymentBackend(async payload=>{session=payload;return {url:'https://checkout.stripe.com/c/pay/mock'};});
  const result=await request({...booking,...tip,paymentKind:kind,amount:1},'/api/create-checkout-session');
  assert.equal(result.status,200);assert.deepEqual(Array.from(session.line_items,x=>x.price_data.unit_amount),expected);
 }
});
test('Stripe rejects invalid gratuities, unsupported percentages, stale fare and zero tip-only payments',async()=>{
 let calls=0; const request=paymentBackend(async()=>{calls++;return {};});
 for(const tip of [{tipCents:-1},{tipCents:1.5},{tipCents:100001},{tipPercent:100},{tipPercent:'20'},{tipPercent:20,tipCents:100},{paymentKind:'unknown'},{paymentKind:'tip_only',tipCents:0}]){
  const result=await request({...booking,...tip},'/api/create-checkout-session');assert.equal(result.status,400);
 }
 assert.equal((await request({...booking,expectedFareCents:1},'/api/create-checkout-session')).status,409);
 assert.equal(calls,0);
});
test('tip changes update payment preview and reservation link; custom values are validated',async()=>{
 const {element}=frontend(async()=>({ok:true,json:async()=>sampleQuote}));
 await element('calculate').click();
 element('tipChoice').value='20';element('tipChoice').change();
 assert.equal(element('tipTotal').textContent,'$16.00');assert.equal(element('paymentTotal').textContent,'$96.00');
 assert.equal(new URL(element('payLater').href).searchParams.get('tip'),'20');
 element('paymentKind').value='tip_only';element('paymentKind').change();assert.equal(element('paymentTotal').textContent,'$16.00');
 element('tipChoice').value='custom';element('customTip').value='12.34';element('tipChoice').change();assert.equal(element('tipTotal').textContent,'$12.34');
 element('customTip').value='-1';element('customTip').input();assert.equal(element('checkout').disabled,true);
});
test('checkout sends selected tip and server fare, and restores controls on payment failure',async()=>{
 const {element}=frontend(async(url,opts)=>{
  if(url.endsWith('/api/quote'))return {ok:true,json:async()=>sampleQuote};
  const payload=JSON.parse(opts.body);assert.equal(payload.tipPercent,15);assert.equal(payload.expectedFareCents,8000);assert.equal(payload.paymentKind,'tip_only');
  return {ok:false,json:async()=>({error:'Payment unavailable'})};
 });
 await element('calculate').click();element('tipChoice').value='15';element('tipChoice').change();element('paymentKind').value='tip_only';element('paymentKind').change();
 await element('checkout').click();assert.equal(element('checkoutStatus').textContent,'Payment unavailable');assert.equal(element('checkout').disabled,false);assert.equal(element('from').disabled,false);
});

test('resolved addresses are reused across service tiers and reverse trips',async()=>{
 let geocodes=0;
 const request=backend(async url=>({ok:true,json:async()=>url.includes('/search?')?(geocodes++,[place]):{code:'Ok',routes:[{distance:16093.44,duration:1200}]}}));
 for(const body of [{from:'Boston',to:'Woburn'},{from:'Boston',to:'Woburn',tier:'comfort'},{from:'woburn',to:'  BOSTON  '}])assert.equal((await request(body)).status,200);
 assert.equal(geocodes,2);
});
test('provider rate limit stops subsequent geocoder calls during cooldown',async()=>{
 let calls=0;
 const request=backend(async()=>{calls++;return {ok:false,status:429,headers:{get:()=> '120'}};});
 assert.equal((await request({from:'Boston',to:'Woburn'})).data.code,'MAP_RATE_LIMIT');
 assert.equal((await request({from:'Cambridge',to:'Logan'})).data.code,'MAP_RATE_LIMIT');
 assert.equal(calls,1);
});
test('automatic fare waits for both address fields to be completed and does not repeat on blur',()=>{
 const html=fs.readFileSync('index.html','utf8');
 const source=html.slice(html.indexOf(' let timer;\n const type='),html.indexOf(' window.sendUnpricedRequest='));
 let next=0,calls=0;const tasks=new Map(),elements={};
 const el=id=>elements[id]??={value:id==='serviceType'?'transfer':'',disabled:false,events:{},addEventListener(name,fn){(this.events[name]??=[]).push(fn);},click(){calls++;}};
 const fire=(id,event)=>{for(const fn of el(id).events[event]||[])fn();};
 const flush=()=>{for(const [id,fn] of [...tasks]){tasks.delete(id);fn();}};
 vm.runInNewContext(source,{el,quote:null,selectedTier:()=> 'luxury',setTimeout(fn){tasks.set(++next,fn);return next;},clearTimeout(id){tasks.delete(id);}});
 el('origen').value='Boston';fire('origen','input');fire('origen','blur');flush();assert.equal(calls,0);
 el('destino').value='Woburn';fire('destino','input');flush();assert.equal(calls,0);
 fire('destino','change');fire('destino','blur');flush();assert.equal(calls,1);
 fire('origen','blur');fire('destino','blur');flush();assert.equal(calls,1);
});

test('round-trip test form sends the quoted schedule once and shows a pending reference',async()=>{
 const origin='http://127.0.0.1:55483';
 const paths=[];
 const {element}=frontend(async(url,options)=>{
  paths.push(new URL(url).pathname);
  const body=JSON.parse(options.body);
  assert.equal(body.returnTime,'11:00');
  if(paths.length===1)return {ok:true,json:async()=>({
   outbound:{miles:10,minutes:20,base:35,mileage:35,time:10,airportFee:0},
   outboundFareCents:8000,returnFareCents:8000,subtotalCents:16000,discountCents:1600,extrasCents:0,totalCents:14400
  })};
  assert.equal(body.expectedFareCents,14400);
  assert.equal(body.email,'rider@example.test');
  return {status:201,json:async()=>({status:'pending',reference:'PT-TEST1234'})};
 },{origin,pathname:'/test/round-trip-calculator'});
 for(const [id,value] of Object.entries({tripType:'round_trip',outboundDate:'2026-12-01',outboundTime:'14:30',
   returnDate:'2026-12-02',returnTime:'11:00',testRoundTripEmail:'rider@example.test'}))element(id).value=value;
 await element('calculate').click();
 assert.equal(element('testRoundTripForm').hidden,false);
 const event={preventDefault(){}};
 await element('testRoundTripForm').submit(event);
 await element('testRoundTripForm').submit(event);
 assert.deepEqual(paths,['/api/round-trip-quote','/api/test/round-trip-request']);
 assert.match(element('testRoundTripStatus').textContent,/PT-TEST1234/);
});

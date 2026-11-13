'use strict';
// Read-only reachability checks. Never submit bookings or expose service secrets.
// Usage: node scripts/check-staging-channels.js
const targets=[
 {name:'booking-staging',url:'https://pimentel-booking-integration-staging.onrender.com/'},
 {name:'dispatch-staging',url:'https://pimentel-dispatch-oregon-staging.onrender.com/ready'}
];
async function probe(target,fetchImpl=fetch){
 try{
  const response=await fetchImpl(target.url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Accept:'application/json'}});
  const body=await response.json().catch(()=>null);
  const ok=response.ok && (target.name==='booking-staging'
   ? body?.status==='online'
   : body?.ready===true);
  return {name:target.name,reachable:ok,httpStatus:response.status};
 }catch{return {name:target.name,reachable:false,httpStatus:null};}
}
if(require.main===module)(async()=>{
 const results=await Promise.all(targets.map(t=>probe(t)));
 for(const result of results)console.log(JSON.stringify(result));
 if(results.some(r=>!r.reachable))process.exitCode=1;
})();
module.exports={probe,targets};

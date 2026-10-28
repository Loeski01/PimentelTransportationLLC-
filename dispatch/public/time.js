(function(root){
"use strict";
const format = new Intl.DateTimeFormat("en-CA", { timeZone:"America/New_York",
  year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23" });
function bostonDateTime(date,time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time || "")) return null;
  const wanted = date + "T" + time, utc = Date.parse(wanted + ":00Z");
  if (!Number.isFinite(utc)) return null;
  const candidates = [4,5].map(hours=>new Date(utc+hours*3600000)).filter(value=>{
    const p=Object.fromEntries(format.formatToParts(value).map(part=>[part.type,part.value]));
    return p.year+"-"+p.month+"-"+p.day+"T"+p.hour+":"+p.minute===wanted;
  });
  // Reject nonexistent spring hours and ambiguous fall hours rather than shift a pickup.
  return candidates.length===1?candidates[0]:null;
}
if(typeof module==="object"&&module.exports)module.exports={bostonDateTime};else root.PimentelTime={bostonDateTime};
})(typeof window==="object"?window:this);

'use strict';
const WAIT_MS=15*60*1000;
function canMarkNoShow({status,arrivedAt,now=Date.now()}){
  if(status!=='accepted'||!arrivedAt)return false;
  const arrival=Date.parse(arrivedAt);
  return Number.isFinite(arrival)&&Number.isFinite(now)&&now-arrival>=WAIT_MS;
}
module.exports={WAIT_MS,canMarkNoShow};

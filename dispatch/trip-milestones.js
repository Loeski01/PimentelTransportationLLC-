'use strict';
// Shared dispatch milestone rules. This module is intentionally not wired into
// production or staging routes until the database migration and tests are ready.
const MILESTONES=Object.freeze({
  on_my_way:Object.freeze({label:'En camino',notifyAdmin:true,action:'on_my_way'}),
  arrived_at_pickup:Object.freeze({label:'Llegué al punto de recogida',notifyAdmin:true,action:'arrived_at_pickup'}),
  passenger_on_board:Object.freeze({label:'Cliente a bordo',notifyAdmin:false,action:'driver:started'}),
  trip_completed:Object.freeze({label:'Viaje completado',notifyAdmin:true,action:'driver:completed'})
});
const ORDER=Object.freeze(['on_my_way','arrived_at_pickup','passenger_on_board','trip_completed']);
function canRecordMilestone({status,completed=[]},milestone){
  if(!Object.hasOwn(MILESTONES,milestone))return false;
  if(!['accepted','started'].includes(status))return false;
  const index=ORDER.indexOf(milestone);
  if(completed.includes(milestone))return false;
  if(index>0&&!completed.includes(ORDER[index-1]))return false;
  if(index===0&&status!=='accepted')return false;
  if(index===1&&status!=='accepted')return false;
  if(index===2&&status!=='accepted')return false;
  if(index===3&&status!=='started')return false;
  return true;
}
function adminNotificationFor(milestone){
  const item=MILESTONES[milestone];
  return item?.notifyAdmin===true?{type:milestone,label:item.label}:null;
}
module.exports={MILESTONES,ORDER,canRecordMilestone,adminNotificationFor};

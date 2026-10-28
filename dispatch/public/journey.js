(function(root){
 "use strict";
 const labels={not_started:"Aceptado",on_the_way:"En camino a la recogida",arrived:"En el punto de recogida",passenger_onboard:"Pasajero a bordo",completed:"Completado"};
 function groupTrips(rows){
  const groups={offers:[],active:[],upcoming:[],history:[]};
  for(const trip of rows){
   if(trip.status==="offered"&&trip.booking_status==="assigned")groups.offers.push(trip);
   else if(trip.status==="accepted"&&trip.booking_status==="in_progress")groups.active.push(trip);
   else if(trip.status==="accepted"&&trip.booking_status==="assigned")groups.upcoming.push(trip);
   else groups.history.push(trip);
  }
  for(const name of ["offers","active","upcoming"])groups[name].sort((a,b)=>new Date(a.pickup_at)-new Date(b.pickup_at));
  groups.history.sort((a,b)=>new Date(b.pickup_at)-new Date(a.pickup_at));
  return groups;
 }
 function nextAction(trip){
  if(trip.status!=="accepted")return null;
  if(trip.booking_status==="assigned"&&trip.trip_stage==="not_started")return {path:"start",label:"Voy a recoger al pasajero"};
  if(trip.booking_status!=="in_progress")return null;
  return {
   on_the_way:{path:"arrive",label:"Llegué al punto de recogida"},
   arrived:{path:"onboard",label:"Pasajero a bordo"},
   passenger_onboard:{path:"complete",label:"Finalizar viaje"}
  }[trip.trip_stage]||null;
 }
 function statusLabel(trip){
  if(trip.booking_status==="cancelled")return "Cancelado";
  if(trip.status==="accepted")return labels[trip.trip_stage]||"Aceptado";
  return {offered:"Pendiente de aceptar",rejected:"Rechazado",revoked:"Asignación retirada",completed:"Completado"}[trip.status]||trip.status;
 }
 if(typeof module==="object"&&module.exports)module.exports={groupTrips,nextAction,statusLabel};
 else root.PimentelJourney={groupTrips,nextAction,statusLabel};
})(typeof window==="object"?window:this);

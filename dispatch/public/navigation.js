(function(root){
 "use strict";
 function mapUrl(provider,address){
  if(typeof address!=="string"||!address.trim()||address.length>1000)return null;
  let url;
  if(provider==="google"){
   url=new URL("https://www.google.com/maps/dir/");
   url.searchParams.set("api","1");url.searchParams.set("destination",address.trim());
   url.searchParams.set("travelmode","driving");url.searchParams.set("dir_action","navigate");
  }else if(provider==="apple"){
   url=new URL("https://maps.apple.com/directions");
   url.searchParams.set("destination",address.trim());url.searchParams.set("mode","driving");
  }else if(provider==="waze"){
   url=new URL("https://waze.com/ul");
   url.searchParams.set("q",address.trim());url.searchParams.set("navigate","yes");
  }else return null;
  return url.href.length<=2048?url.href:null;
 }
 function tripNavigation(trip,provider){
  if(trip.status!=="accepted"||!["assigned","in_progress"].includes(trip.booking_status))return null;
  return {pickup:mapUrl(provider,trip.pickup),destination:mapUrl(provider,trip.destination)};
 }
 if(typeof module==="object"&&module.exports)module.exports={mapUrl,tripNavigation};
 else root.PimentelNavigation={mapUrl,tripNavigation};
})(typeof window==="object"?window:this);

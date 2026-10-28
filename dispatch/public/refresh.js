(function(root){
 "use strict";
 function createRefresher({refresh,shouldRefresh=()=>true,onError=()=>{},period=30000,setTimer=setTimeout,clearTimer=clearTimeout}){
  let timer,running=false,stopped=false;
  async function run(){
   if(stopped||running)return;
   clearTimer(timer);
   try{if(shouldRefresh()){running=true;await refresh();}}
   catch(error){onError(error);}
   finally{running=false;if(!stopped)timer=setTimer(run,period);}
  }
  timer=setTimer(run,period);
  return {refreshNow:run,stop(){stopped=true;clearTimer(timer);}};
 }
 if(typeof module==="object"&&module.exports)module.exports={createRefresher};
 else root.PimentelRefresh={createRefresher};
})(typeof window==="object"?window:this);

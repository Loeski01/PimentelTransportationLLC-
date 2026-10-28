"use strict";
const crypto=require("node:crypto");
const validPin=pin=>typeof pin==="string"&&/^[0-9]{4}$/.test(pin);
function createDriverLimiter({now=Date.now}={}){
 const failures=new Map(),traffic=new Map(),window=15*60*1000;
 const key=email=>crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
 function clean(map){for(const [id,item] of map)if(item.expires<=now())map.delete(id);}
 return {
  allowTraffic(ip){
   clean(traffic);
   for(const [id,max] of [["global",1000],["ip:"+String(ip||"unknown"),200]]){
    const entry=traffic.get(id)||{count:0,expires:now()+window};
    if(entry.count>=max||(!traffic.has(id)&&traffic.size>=10000))return false;
    entry.count++;traffic.set(id,entry);
   }return true;
  },
  blocked(email){clean(failures);const item=failures.get(key(email));return Boolean(item&&item.count>=5)||(!item&&failures.size>=10000);},
  failed(email){clean(failures);const id=key(email),item=failures.get(id)||{count:0,expires:now()+window};if(failures.has(id)||failures.size<10000){item.count++;failures.set(id,item);}},
  clear(email){failures.delete(key(email));}
 };
}
const driverLimiter=createDriverLimiter();
async function ensureDriverPinSchema(pool){
 const database=await pool.query("SELECT current_database() AS name");
 if(database.rows[0]?.name!=="pimentel_dispatch_dev")throw Error("Unexpected driver PIN database");
 await pool.query("ALTER TABLE drivers ADD COLUMN IF NOT EXISTS pin_configured BOOLEAN NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS failed_pin_attempts INTEGER NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS pin_locked_until TIMESTAMPTZ");
 await pool.query("DELETE FROM driver_sessions WHERE driver_id IN (SELECT id FROM drivers WHERE pin_configured=false)");
}
module.exports={validPin,createDriverLimiter,driverLimiter,ensureDriverPinSchema};

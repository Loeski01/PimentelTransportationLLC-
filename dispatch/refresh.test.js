"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {createRefresher}=require("./public/refresh");
test("automatic refresh skips inactive sessions and never overlaps requests",async()=>{
 let active=false,callback,calls=0,resolve;
 const timers=new Set();
 const refresh=createRefresher({shouldRefresh:()=>active,refresh:()=>{calls++;return new Promise(r=>resolve=r);},setTimer:fn=>{callback=fn;timers.add(fn);return fn;},clearTimer:fn=>timers.delete(fn)});
 await callback();assert.equal(calls,0);
 active=true;const pending=refresh.refreshNow();assert.equal(calls,1);
 await refresh.refreshNow();assert.equal(calls,1);
 resolve();await pending;assert.equal(timers.size,1);
 refresh.stop();assert.equal(timers.size,0);
 await refresh.refreshNow();assert.equal(calls,1);
});
test("refresh schedules another attempt after a network failure",async()=>{
 let callback,errors=0;
 const refresh=createRefresher({refresh:async()=>{throw Error("offline");},onError:()=>errors++,setTimer:fn=>{callback=fn;return fn;},clearTimer:()=>{}});
 await callback();assert.equal(errors,1);assert.equal(typeof callback,"function");refresh.stop();
});

"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
test("service worker does not intercept API or cache private navigation",async()=>{
 const handlers={},stored=[];
 let online=true;
 const offline={offline:true};
 const context={
  URL,
  self:{location:{origin:"https://dispatch.example"},clients:{claim:async()=>{}},addEventListener:(event,fn)=>handlers[event]=fn},
  caches:{open:async()=>({addAll:async assets=>stored.push(...assets)}),keys:async()=>[],match:async path=>path==="/conductores/offline.html"?offline:undefined},
  fetch:async()=>{if(!online)throw Error("offline");return {live:true};}
 };
 vm.runInNewContext(fs.readFileSync(__dirname+"/public/sw.js","utf8"),context);
 let work;
 handlers.install({waitUntil:p=>work=p});await work;
 assert.ok(stored.every(path=>/icon-\d+\.png$|offline\.html$/.test(path)));
 function fetchEvent(path,mode="cors",method="GET"){
  let response;
  handlers.fetch({request:{url:"https://dispatch.example"+path,method,mode},respondWith:p=>response=p});
  return response;
 }
 assert.equal(fetchEvent("/api/dispatch/my-assignments"),undefined);
 assert.equal(fetchEvent("/api/dispatch/admin/session"),undefined);
 assert.equal(fetchEvent("/api/dispatch/login","cors","POST"),undefined);
 assert.deepEqual(await fetchEvent("/conductores/","navigate"),{live:true});
 online=false;
 assert.equal(await fetchEvent("/conductores/","navigate"),offline);
});
test("install manifest references real icons inside driver scope",()=>{
 const manifest=JSON.parse(fs.readFileSync(__dirname+"/public/manifest.webmanifest","utf8"));
 assert.equal(manifest.scope,"/conductores/");
 assert.equal(manifest.start_url,"/conductores/");
 for(const icon of manifest.icons){
  const data=fs.readFileSync(__dirname+"/public/"+icon.src);
  assert.equal(data.readUInt32BE(16),Number(icon.sizes.split("x")[0]));
  assert.equal(data.readUInt32BE(20),Number(icon.sizes.split("x")[1]));
 }
});

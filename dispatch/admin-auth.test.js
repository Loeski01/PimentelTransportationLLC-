"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const express=require("express");
const {createAdminAuth}=require("./admin-auth");
test("admin login, origin, CSRF, expiry, logout and rate limits",async()=>{
 let time=Date.now();
 const salt="a".repeat(32);
 const password="test-only-password-123";
 const auth=createAdminAuth({email:"admin@example.com",passwordHash:salt+":"+crypto.scryptSync(password,salt,64).toString("hex"),origin:"https://dispatch.example",now:()=>time});
 const app=express();app.use(express.json());
 app.post("/login",auth.login);
 app.get("/session",auth.authenticate,(req,res)=>res.json({ok:true}));
 app.post("/change",auth.authenticate,(req,res)=>res.json({ok:true}));
 app.post("/logout",auth.authenticate,auth.logout);
 const server=app.listen(0,"127.0.0.1");
 await new Promise(resolve=>server.once("listening",resolve));
 const base="http://127.0.0.1:"+server.address().port;
 const request=(path,method="GET",headers={},body)=>fetch(base+path,{method,headers:{"Content-Type":"application/json",...headers},body:body?JSON.stringify(body):undefined});
 const login=()=>request("/login","POST",{Origin:"https://dispatch.example"},{email:"admin@example.com",password});
 try{
  assert.equal((await request("/session")).status,401);
  assert.equal((await request("/login","POST",{Origin:"https://evil.example"},{email:"admin@example.com",password})).status,403);
  assert.equal((await request("/login","POST",{Origin:"https://dispatch.example"},{email:"admin@example.com",password:"incorrect-password"})).status,401);
  let r=await login();assert.equal(r.status,200);
  const cookie=r.headers.get("set-cookie");
  for(const flag of ["HttpOnly","Secure","SameSite=Strict","Path=/"])assert.ok(cookie.includes(flag));
  const token=cookie.split(";")[0],csrf=(await r.json()).csrfToken;
  assert.equal((await request("/session","GET",{Cookie:token})).status,200);
  assert.equal((await request("/change","POST",{Cookie:token,Origin:"https://dispatch.example"})).status,403);
  assert.equal((await request("/change","POST",{Cookie:token,Origin:"https://evil.example","X-CSRF-Token":csrf})).status,403);
  const headers={Cookie:token,Origin:"https://dispatch.example","X-CSRF-Token":csrf};
  assert.equal((await request("/change","POST",headers)).status,200);
  assert.equal((await request("/logout","POST",headers)).status,200);
  assert.equal((await request("/session","GET",{Cookie:token})).status,401);
  r=await login();const expired=r.headers.get("set-cookie").split(";")[0];
  time+=3600001;
  assert.equal((await request("/session","GET",{Cookie:expired})).status,401);
  for(let i=0;i<8;i++)await login();
  assert.equal((await login()).status,429);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test("reject missing or malformed administrator configuration",()=>{
 for(const options of [{},{email:"a",passwordHash:"plaintext",origin:"https://a.example"}])
  assert.throws(()=>createAdminAuth(options));
});

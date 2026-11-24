'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {createDispatchRouter}=require('../router');
test('two arrival presses yield one simulated SMS',async()=>{
 let arrived=false,claims=0,sends=0;
 const db={connect:async()=>({query:async(sql)=>{
 if(sql.includes('UPDATE dispatch_trips SET arrived_at=')){if(arrived)return {rowCount:0,rows:[]};arrived=true;return {rowCount:1,rows:[{id:7,arrived_at:new Date().toISOString(),passenger_phone:'6175550100',pickup_address:'Logan'}]};}
 if(sql.includes('INSERT INTO dispatch_arrival_sms')){claims++;return {rowCount:1,rows:[{trip_id:7}]};}
 return {rowCount:1,rows:[]};},release:()=>{}}),query:async()=>({rowCount:1,rows:[]})};
 const app=express();app.use(express.json());app.use('/dispatch',createDispatchRouter({db,requireAdmin:(req,res,next)=>next(),requireDriver:(req,res,next)=>{req.driver={id:2};next()},sendArrivalSms:async()=>{sends++;return {messageId:'mock'};}}));
 const server=app.listen(0,'127.0.0.1');
 try{await new Promise(resolve=>server.once('listening',resolve));const url='http://127.0.0.1:'+server.address().port+'/dispatch/driver/trips/7/arrive';assert.equal((await fetch(url,{method:'POST'})).status,200);assert.equal((await fetch(url,{method:'POST'})).status,409);assert.equal(sends,1);assert.equal(claims,1);}
 finally{await new Promise(resolve=>server.close(resolve));}
});

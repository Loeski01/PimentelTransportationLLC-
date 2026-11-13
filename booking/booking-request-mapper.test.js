'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {buildBookingRecord}=require('./booking-request-mapper');
const body={name:'Maria Castillo',phone:'6175550100',email:'maria@example.com',from:'Logan Airport',to:'Woburn, MA',date:'2026-11-14',time:'14:30',passengers:'2',details:'Child seat',payment:'later',tier:'luxury',expectedFareCents:1,tipPercent:15,tipCents:0};
test('uses server fare and computes percentage tip',()=>{const r=buildBookingRecord(body,'PT-ABC123',8000);assert.equal(r.fareCents,8000);assert.equal(r.tipCents,1200);assert.equal(r.reference,'PT-ABC123');});
test('uses fixed tip cents when percentage is zero',()=>{const r=buildBookingRecord({...body,tipPercent:0,tipCents:500},'PT-ABC123',8000);assert.equal(r.tipCents,500);});
test('rejects invalid server fare',()=>assert.throws(()=>buildBookingRecord(body,'PT-ABC123',-1),/Server-calculated/));
test('rejects conflicting tip inputs',()=>assert.throws(()=>buildBookingRecord({...body,tipCents:300},'PT-ABC123',8000),/Invalid tip/));

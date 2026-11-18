'use strict';
const assert=require('node:assert/strict');
const {notificationHealth}=require('./notification-health');
async function run(){
 let calls=0;
 const client={query:async sql=>{calls++;assert.match(sql,/status='failed'/);assert.match(sql,/sending_started_at < now\(\)-interval '15 minutes'/);return {rows:[{failed:2,possibly_stuck:1,due:3,accepted:8}]};}};
 const result=await notificationHealth({client});
 assert.deepEqual(result,{failed:2,possiblyStuck:1,due:3,accepted:8,needsOperatorAttention:true});
 assert.equal(calls,1);
 const healthy=await notificationHealth({client:{query:async()=>({rows:[{failed:0,possibly_stuck:0,due:0,accepted:4}]})}});
 assert.equal(healthy.needsOperatorAttention,false);
 await assert.rejects(()=>notificationHealth({}),/Database client required/);
 console.log('Notification health mock tests passed (5 assertions)');
}
run().catch(err=>{console.error(err);process.exitCode=1});

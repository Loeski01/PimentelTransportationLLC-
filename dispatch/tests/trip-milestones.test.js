const test=require('node:test');
const assert=require('node:assert/strict');
const {MILESTONES,ORDER,canRecordMilestone,adminNotificationFor}=require('../trip-milestones');
test('exactly three admin alert events',()=>{
 assert.deepEqual(ORDER.filter(x=>MILESTONES[x].notifyAdmin),['on_my_way','arrived_at_pickup','trip_completed']);
 assert.equal(adminNotificationFor('passenger_on_board'),null);
});
test('milestones enforce sequence and reject duplicates',()=>{
 assert.equal(canRecordMilestone({status:'accepted',completed:[]},'on_my_way'),true);
 assert.equal(canRecordMilestone({status:'accepted',completed:[]},'arrived_at_pickup'),false);
 assert.equal(canRecordMilestone({status:'accepted',completed:['on_my_way']},'on_my_way'),false);
 assert.equal(canRecordMilestone({status:'accepted',completed:['on_my_way']},'arrived_at_pickup'),true);
 assert.equal(canRecordMilestone({status:'accepted',completed:['on_my_way','arrived_at_pickup']},'passenger_on_board'),true);
 assert.equal(canRecordMilestone({status:'started',completed:['on_my_way','arrived_at_pickup','passenger_on_board']},'trip_completed'),true);
 assert.equal(canRecordMilestone({status:'completed',completed:ORDER},'trip_completed'),false);
 assert.equal(canRecordMilestone({status:'accepted',completed:[]},'unknown'),false);
});

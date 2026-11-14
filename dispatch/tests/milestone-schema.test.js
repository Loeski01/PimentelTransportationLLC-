const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.join(__dirname,'..');
const schema=fs.readFileSync(path.join(base,'schema.sql'),'utf8');
const migration=fs.readFileSync(path.join(base,'migrations','003-trip-milestones-notifications.sql'),'utf8');

test('development schema and staging migration both define the milestone timestamp',()=>{
 for(const sql of [schema,migration]) assert.match(sql,/on_my_way_at TIMESTAMPTZ/);
 assert.match(migration,/ALTER TABLE dispatch_trips ADD COLUMN IF NOT EXISTS on_my_way_at/);
});

test('admin inbox only permits the three administrator events',()=>{
 for(const sql of [schema,migration]){
  assert.match(sql,/CREATE TABLE IF NOT EXISTS dispatch_admin_notifications/);
  assert.match(sql,/event_type IN \('on_my_way','arrived_at_pickup','trip_completed'\)/);
  assert.match(sql,/UNIQUE \(trip_id, event_type\)/);
  assert.doesNotMatch(sql,/event_type IN \([^\n]*passenger_on_board/);
 }
});

test('staging migration is transactional and rerunnable',()=>{
 assert.match(migration,/^BEGIN;/m);
 assert.match(migration,/^COMMIT;/m);
 assert.match(migration,/ADD COLUMN IF NOT EXISTS/);
 assert.match(migration,/CREATE INDEX IF NOT EXISTS/);
});

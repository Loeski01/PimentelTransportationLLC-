// Safety-focused contract checks for completed-trip archiving.
// Run with: node --test tests/archive-contract.test.js
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const router=fs.readFileSync(path.join(__dirname,'../router.js'),'utf8');
const panel=fs.readFileSync(path.join(__dirname,'../private-panel.html'),'utf8');
const migration=fs.readFileSync(path.join(__dirname,'../migrations/004-trip-archiving.sql'),'utf8');

test('archive operation requires admin authentication and explicit confirmation',()=>{
  assert.match(router,/router\.post\('\/admin\/trips\/archive-completed',requireAdmin/);
  assert.match(router,/req\.body\?\.confirm!==true/);
});
test('archive updates only completed and not-yet-archived trips',()=>{
  assert.match(router,/UPDATE dispatch_trips SET archived_at=NOW\(\) WHERE status='completed' AND archived_at IS NULL/);
  assert.match(router,/WHERE archived_at IS NULL ORDER BY pickup_at DESC/);
});
test('archived history remains available only to admin',()=>{
  assert.match(router,/router\.get\('\/admin\/trips\/archived',requireAdmin/);
  assert.match(router,/WHERE archived_at IS NOT NULL ORDER BY archived_at DESC/);
});
test('admin panel includes archive confirmation and archived history controls',()=>{
  assert.match(panel,/id="archiveCompleted"/);
  assert.match(panel,/id="viewArchived"/);
  assert.match(panel,/confirm\('¿Archivar los /);
});
test('migration is non-destructive and existing trips remain unarchived',()=>{
  assert.match(migration,/ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ/);
  assert.doesNotMatch(migration,/\b(?:DELETE|TRUNCATE|DROP)\b/i);
});

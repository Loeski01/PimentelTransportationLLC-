const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const migrations=fs.readdirSync(path.join(__dirname,'../migrations')).filter(name=>name.endsWith('.sql'));
test('migration versions are unique and archive follows passenger contact',()=>{
 const versions=migrations.map(name=>name.match(/^(\d+)-/)).filter(Boolean).map(match=>match[1]);
 assert.equal(new Set(versions).size,versions.length,'Duplicate migration version detected');
 assert.ok(migrations.includes('004-passenger-contact.sql'));
 assert.ok(migrations.includes('005-trip-archiving.sql'));
});
test('archive migration never deletes existing records',()=>{
 const sql=fs.readFileSync(path.join(__dirname,'../migrations/005-trip-archiving.sql'),'utf8');
 assert.match(sql,/ADD COLUMN IF NOT EXISTS archived_at/);
 assert.doesNotMatch(sql,/\b(?:DELETE|TRUNCATE|DROP)\b/i);
});

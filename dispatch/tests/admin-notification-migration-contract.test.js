'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {ORDER, MILESTONES, adminNotificationFor} = require('../trip-milestones');

test('notification migration matches administrator-only milestone contract', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../migrations/003-trip-milestones-notifications.sql'), 'utf8');
  assert.match(sql, /BEGIN\s*;/i);
  assert.match(sql, /COMMIT\s*;/i);
  assert.match(sql, /ALTER TABLE dispatch_trips ADD COLUMN IF NOT EXISTS on_my_way_at TIMESTAMPTZ/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS dispatch_admin_notifications/i);
  assert.match(sql, /UNIQUE\s*\(trip_id,\s*event_type\)/i);
  assert.match(sql, /REFERENCES dispatch_trips\(id\)/i);
  assert.match(sql, /REFERENCES dispatch_drivers\(id\)/i);
  const match = sql.match(/event_type TEXT NOT NULL CHECK\s*\(event_type IN\s*\(([^)]+)\)\)/i);
  assert.ok(match, 'migration must constrain notification event types');
  const events = [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  const expected = ORDER.filter(event => MILESTONES[event].notifyAdmin);
  assert.deepEqual(events, expected);
  assert.equal(adminNotificationFor('passenger_on_board'), null);
  assert.equal(events.includes('passenger_on_board'), false);
});

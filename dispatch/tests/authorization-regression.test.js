// Regression checks for dispatch authorization boundaries; no database required.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const router = fs.readFileSync(path.join(__dirname, '..', 'router.js'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
test('admin approval and assignment require admin middleware', () => {
  assert.match(router, /router\.post\('\/admin\/trips\/:id\/approve',\s*requireAdmin/);
  assert.match(router, /router\.post\('\/admin\/trips\/:id\/assign',\s*requireAdmin/);
});
test('driver list is scoped to authenticated driver and omits fare', () => {
  const match = router.match(/router\.get\('\/driver\/trips',requireDriver,[\s\S]*?res\.json\(q\.rows\)/);
  assert.ok(match, 'driver list route must exist and require driver');
  assert.match(match[0], /WHERE driver_id=\$1/);
  assert.match(match[0], /\[req\.driver\.id\]/);
  assert.doesNotMatch(match[0], /fare_cents|payment_/);
});
test('driver status update restricts trip to assigned driver', () => {
  assert.match(router, /WHERE id=\$2 AND driver_id=\$3 AND status=ANY/);
});
test('app requires credentials and isolates dispatch routes', () => {
  for (const key of ['DISPATCH_DATABASE_URL','DISPATCH_SESSION_SECRET','DISPATCH_ADMIN_PASSWORD_HASH'])
    assert.ok(app.includes(key));
  assert.match(app, /app\.use\('\/dispatch',createDispatchRouter/);
});

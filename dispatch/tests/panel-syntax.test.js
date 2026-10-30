const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

test('private driver panel inline scripts parse as JavaScript',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','private-panel.html'),'utf8');
 const scripts=[...html.matchAll(/<script\b[^>]*>([^]*?)<\/script>/gi)].map(m=>m[1]).filter(Boolean);
 assert.ok(scripts.length>0,'expected at least one inline script');
 for(const script of scripts) assert.doesNotThrow(()=>new vm.Script(script,{filename:'private-panel.html'}));
});

test('driver panel does not display fare or payment fields',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','private-panel.html'),'utf8');
 assert.doesNotMatch(html,/fare_cents|payment_intent|card_number/i);
});

test('dispatch driver API excludes fare and payment columns',()=>{
 const router=fs.readFileSync(path.join(__dirname,'..','router.js'),'utf8');
 const start=router.indexOf("router.get('/driver/trips'");
 const end=router.indexOf("router.post('/driver/trips/:id/arrive'",start);
 assert.ok(start>=0&&end>start,'driver trips endpoint must exist');
 const endpoint=router.slice(start,end);
 assert.match(endpoint,/SELECT id,passenger_surname,pickup_address,destination_address,pickup_at,arrived_at,status FROM dispatch_trips/);
 assert.doesNotMatch(endpoint,/fare_cents|payment_intent|SELECT \*/i);
});

test('driver trip query remains restricted to logged-in driver',()=>{
 const router=fs.readFileSync(path.join(__dirname,'..','router.js'),'utf8');
 const start=router.indexOf("router.get('/driver/trips'");
 const end=router.indexOf("router.post('/driver/trips/:id/arrive'",start);
 const endpoint=router.slice(start,end);
 assert.match(endpoint,/requireDriver/);
 assert.match(endpoint,/WHERE driver_id=\$1/);
 assert.match(endpoint,/\[req\.driver\.id\]/);
});

test('no-show countdown refreshes driver actions automatically at zero',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','private-panel.html'),'utf8');
 assert.match(html,/if\(!remaining\)\{clearInterval\(interval\);loadDriver\(\)\.catch\(e=>msg\(e\.message\)\)\}/);
});


test('welcome sign uses passenger surname and company branding',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','private-panel.html'),'utf8');
 assert.match(html,/Cartel de bienvenida/);
 assert.match(html,/background:black;color:white/);
 assert.match(html,/PIMENTEL TRANSPORTATION/);
 assert.match(html,/t\.passenger_surname\.toUpperCase\(\)/);
 assert.match(html,/style\.color='#edc652'/);
});

test('driver offers explicit start and finish trip actions',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','private-panel.html'),'utf8');
 assert.match(html,/started:\['completed'\]/);
 assert.match(html,/accepted:\['started','no_show'\]/);
 assert.match(html,/started:'Iniciar viaje'/);
 assert.match(html,/completed:'Finalizar viaje'/);
});

test('driver navigation includes Google Maps, Apple Maps and Waze',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','private-panel.html'),'utf8');
 assert.match(html,/google\.com\/maps\/dir/);
 assert.match(html,/maps\.apple\.com/);
 assert.match(html,/waze\.com\/ul/);
});


test('installable driver app includes manifest and iPhone home-screen metadata',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','private-panel.html'),'utf8');
 const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'..','manifest.webmanifest'),'utf8'));
 const icon=fs.readFileSync(path.join(__dirname,'..','app-icon.svg'),'utf8');
 const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
 assert.match(html,/rel="manifest" href="\/manifest\.webmanifest"/);
 assert.match(html,/apple-mobile-web-app-capable/);
 assert.equal(manifest.start_url,'/panel');
 assert.equal(manifest.display,'standalone');
 assert.match(icon,/<svg /);
 assert.match(app,/app\.get\('\/manifest\.webmanifest'/);
 assert.match(app,/app\.get\('\/app-icon\.svg'/);
});


test('installed app restores only server-validated sessions',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','private-panel.html'),'utf8');
 const login=fs.readFileSync(path.join(__dirname,'..','login.js'),'utf8');
 assert.match(html,/api\('\/auth\/session'\)/);
 assert.match(html,/restoreSession\(\)/);
 assert.match(login,/router\.get\('\/session'/);
 assert.match(login,/req\.session\.role==='driver'/);
 assert.match(login,/active=TRUE/);
 assert.match(login,/authenticated:false/);
});


test('logout destroys server session and clears browser session cookie',()=>{
 const login=fs.readFileSync(path.join(__dirname,'..','login.js'),'utf8');
 assert.match(login,/req\.session\.destroy/);
 assert.match(login,/res\.clearCookie\('dispatch_sid',\{path:'\/'\}\)/);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
test('admin panel handles zero active drivers before assignment',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','private-panel.html'),'utf8');
 assert.ok(html.includes('if(!sel.options.length)'));
 assert.ok(html.includes('No hay conductores activos'));
});

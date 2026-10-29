const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

test('private driver panel inline scripts parse as JavaScript',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','private-panel.html'),'utf8');
 const scripts=html.split('<script>').slice(1).map(s=>s.split('</script>')[0]).filter(Boolean);
 assert.ok(scripts.length>0,'expected at least one inline script');
 for(const script of scripts) assert.doesNotThrow(()=>new vm.Script(script,{filename:'private-panel.html'}));
});

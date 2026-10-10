const fs=require('fs'),assert=require('node:assert/strict');
const html=fs.readFileSync('public/index.html','utf8');
for(const step of ['hub','catalog','simulator','identity','whatsapp','billing','accounting','citas','payments']) {
 assert.equal((html.match(new RegExp('<section id="step-'+step+'"','g'))||[]).length,1,step+' must exist once');
 assert.match(html,new RegExp('id="nav-step-'+step+'"'));
}
const external=[...html.matchAll(/<script[^>]+src="(\/[^"?]+)"/g)].map(m=>fs.readFileSync('public'+m[1],'utf8')).join('\n');
const sources=html+'\n'+external;
const declarations=new Set([...sources.matchAll(/function\s+(\w+)\s*\(|window\.(\w+)\s*=/g)].map(m=>m[1]||m[2]));
const builtins=new Set(['if','alert','confirm','setTimeout','Number','String','parseInt','parseFloat']);
for(const handler of html.matchAll(/\bon(?:click|change|submit|input)="([^"]+)"/g))for(const call of handler[1].matchAll(/(?<![.\w])([a-zA-Z_$][\w$]*)\s*\(/g))assert.ok(declarations.has(call[1])||builtins.has(call[1]),'Missing handler: '+call[1]);
assert.doesNotMatch(html,/\$420\.000|\$185\.000|38 Horas|Reduce el 85%/);
assert.match(html,/switchAuthTab\(reason === 'header' \? 'login' : 'register'\)/);
console.log('PASS: restored sections and navigation, all HTML action handlers declared, login opens login, invented results removed.');

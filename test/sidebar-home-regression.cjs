const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('public/index.html', 'utf8');
for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  if (!m[1].includes('application/ld+json') && m[2].trim()) new vm.Script(m[2]);
}
assert.equal([...html.matchAll(/id="step-hub"/g)].length, 1);
assert.equal([...html.matchAll(/id="main-sidebar"/g)].length, 1);
const classes = new Set();
const saved = {};
const side = { classList: {
  toggle(name) { if (classes.has(name)) { classes.delete(name); return false; } classes.add(name); return true; },
  add(name) { classes.add(name); }
} };
const ctx = {
  document: { getElementById: id => id === 'main-sidebar' ? side : null },
  localStorage: { setItem: (key, value) => { saved[key] = value; }, getItem: key => saved[key] },
  window: { innerWidth: 1100 },
  toggleMobileSidebar: () => { ctx.mobileToggled = true; }
};
vm.createContext(ctx);
const start = html.indexOf('    function toggleDesktopSidebar()');
const end = html.indexOf('    function setupScrollShrink()', start);
vm.runInContext(html.slice(start,end),ctx);
ctx.toggleSidebar();
assert(classes.has('sidebar-collapsed'));
assert.equal(saved.changared_sidebar_collapsed, '1');
classes.clear(); ctx.initSidebarState();
assert(classes.has('sidebar-collapsed'));
ctx.toggleSidebar();
assert(!classes.has('sidebar-collapsed'));
assert.equal(saved.changared_sidebar_collapsed, '0');
ctx.window.innerWidth = 400; ctx.toggleSidebar(); assert(ctx.mobileToggled);
console.log('PASS: all inline scripts parse, one home, desktop sidebar hides/reopens and remembers state, mobile toggle remains separate.');

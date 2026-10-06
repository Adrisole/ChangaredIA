const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('public/index.html', 'utf8');
for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  if (!match[1].includes('application/ld+json') && match[2].trim()) new vm.Script(match[2]);
}
const start = html.indexOf('    async function deleteProductRow');
const end = html.indexOf('    function renderCatalogTable', start);
async function run(ok) {
  const row = {parentElement: {children: []}};
  row.parentElement.children = [row];
  const button = {closest: () => row};
  let body;
  let rendered = false;
  const context = {currentBusiness: {catalog: [{id: 'test', stock: 1}], description: 'Test'}, currentCompany: {id: 'test', name: 'Test'}, currentUser: {}, authToken: 'test',
    fetch: async (_, options) => {body = JSON.parse(options.body); return {ok, json: async () => ({success: ok})};},
    renderCatalogTable: () => {rendered = true;}, showToast: () => {}, button};
  vm.createContext(context);
  vm.runInContext(html.slice(start, end), context);
  await context.deleteProductRow(button);
  assert.deepEqual(body.catalog, []);
  assert.equal(context.currentBusiness.catalog.length, ok ? 0 : 1);
  assert.equal(rendered, ok);
  if (!ok) assert.equal(button.disabled, false);
}
(async () => {await run(true); await run(false); console.log('PASS: scripts parse, last product deletion persists [], failed save retains product.');})().catch(error => {console.error(error); process.exitCode = 1;});

const fs = require('node:fs');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const html = fs.readFileSync('public/index.html', 'utf8');
const businessState = html.slice(html.indexOf('    let currentBusiness ='), html.indexOf('    const DEMO_BUSINESS_DATA'));
const companyState = html.slice(html.indexOf('    const DEFAULT_COMPANY_DATA ='), html.indexOf('    function emptyCompany()'));
const ctx = {};
vm.createContext(ctx);
vm.runInContext(businessState + '\nglobalThis.business = currentBusiness;', ctx);
vm.runInContext(companyState + '\nglobalThis.company = DEFAULT_COMPANY_DATA;', ctx);
assert.equal(ctx.business.catalog.length, 0);
assert.equal(ctx.business.businessRules.length, 0);
for (const field of ['phone','email','paymentMethod','cuit']) assert.equal(ctx.company[field], '');
assert.equal(ctx.company.services.length, 0);
assert.equal(ctx.company.deposit, 0);
for (const step of ['billing','citas','accounting']) {
  const section = html.match(new RegExp('<section id="step-' + step + '"[\\s\\S]*?</section>'))[0];
  assert.match(section, /<button|<input|<select/);
  assert.doesNotMatch(section, /142|710\.000|94\.2|98\.4|39\.000|30%|85%/);
}
assert.match(html, /onclick="openBusinessConfigModal\(\)"/);
assert.doesNotMatch(html, /currentCompany\.paymentMethod \|\| 'pagos\.miempresa\.mp'/);
const brain = fs.readFileSync('src/services/agentBrain.service.js','utf8');
const advisor = brain.slice(brain.indexOf('async generateChangaredSalesReply'));
assert.doesNotMatch(advisor, /85%|65%|\$19|30 segundos/);
assert.match(advisor, /credenciales oficiales/);
console.log('PASS: empty initial business, no invented contact/payment data, restored modules carry no invented performance metrics, adviser does not promise invented results.');

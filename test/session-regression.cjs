const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('public/index.html', 'utf8');
const empty = html.slice(html.indexOf('    function emptyCompany()'), html.indexOf('    let currentCompany = currentUser'));
const reset = html.slice(html.indexOf('    function resetAccountState('), html.indexOf('    function slugify'));
const context = {currentUser: {id:'new'}, currentCompany: {name:'Previous',activeEmployees:['cobranzas']}, currentBusiness:{catalog:[{id:'old'}]},localInvoices:[{}],whatsappConversationsCache:[{}],activeWhatsAppChat:'old',
 DEFAULT_COMPANY_DATA:{name:'Demo',activeEmployees:['vendedor']},DEMO_BUSINESS_DATA:{catalog:[{id:'demo'}]},
 localStorage:{removeItem:()=>{}},document:{getElementById:()=>({innerHTML:'old'})},renderAccountingView:()=>{},renderCatalogTable:()=>{},applyCompanyDataToUI:()=>{}};
vm.createContext(context); vm.runInContext(empty+reset,context);
context.resetAccountState();
assert.equal(context.currentBusiness.catalog.length,0);
assert.equal(context.currentCompany.activeEmployees.length,0);
assert.equal(context.localInvoices.length,0);
context.resetAccountState({id:'own',name:'Own',catalog:[],activeEmployees:['citas']});
assert.equal(context.currentCompany.slug,'own');
assert.equal(context.currentCompany.activeEmployees[0],'citas');
context.currentUser=null; context.resetAccountState();
assert.equal(context.currentCompany.name,'Demo');
assert.equal(context.currentBusiness.catalog[0].id,'demo');
assert.equal(context.activeWhatsAppChat,null);
console.log('PASS: new account empty, own business loaded, logout restores separate demo and clears private state.');

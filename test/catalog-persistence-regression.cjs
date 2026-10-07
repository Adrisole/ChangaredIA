const fs=require('fs');const vm=require('vm');const assert=require('node:assert/strict');
const html=fs.readFileSync('public/index.html','utf8');
const block=(from,to)=>html.slice(html.indexOf(from),html.indexOf(to,html.indexOf(from)));
let stored={id:'original-shop',name:'Original',description:'Shop',catalog:[]};let fail=false;let renders=0;
const fields={};for(const [id,value] of Object.entries({'modal-prod-name':'Prueba Mongo','modal-prod-price':'100','modal-prod-stock':'4','modal-prod-cat':'General','modal-prod-desc':'Detalle','input-business-name':'Nombre Nuevo','input-business-desc':'Nueva descripción','select-business-lang':'Español','check-auto-detect':''}))fields[id]={value,checked:true};fields['input-business-id']={value:''};
const context=vm.createContext({structuredClone,crypto:require('node:crypto'),document:{getElementById:id=>fields[id]},showToast:()=>{},closeAddProductModal:()=>{},renderCatalogTable:()=>renders++,applyCompanyDataToUI:()=>{},currentUser:{id:'owner'},authToken:'token',currentCompany:{id:stored.id,slug:stored.id,name:stored.name},currentBusiness:structuredClone(stored),fetch:async(url,opts)=>{
 const payload=JSON.parse(opts.body);if(fail)return {ok:false,json:async()=>({success:false,message:'DB unavailable'})};
 if(url.endsWith('/catalog')){assert.equal(opts.method,'PUT');assert.equal(url,'/api/business/original-shop/catalog');}
 stored=payload.additions ? {...stored,catalog:[...stored.catalog,...payload.additions]} : {...stored,...payload};return {ok:true,json:async()=>({success:true,data:{business:structuredClone(stored)}})};
}});
vm.runInContext(block('    async function persistBusinessData(', '    // ========================================================='),context);
vm.runInContext(block('    async function saveAllChanges(', '    function showToast('),context);
vm.runInContext(block('    function updateBusinessSlugPreview(', '    function applyCompanyDataToUI('),context);
(async()=>{
 await context.saveNewProduct();assert.equal(stored.catalog.length,1);assert.equal(context.currentCompany.catalog.length,1);assert.equal(stored.catalog[0].stock,4);
 context.currentBusiness=structuredClone(stored);assert.equal(context.currentBusiness.catalog[0].name,'Prueba Mongo');
 fields['modal-prod-name'].value='No guardar';fields['modal-prod-price'].value='20';fail=true;await context.saveNewProduct();assert.equal(stored.catalog.length,1);assert.equal(context.currentBusiness.catalog.length,1);assert.equal(fields['modal-prod-name'].value,'No guardar');
 fail=false;await context.saveAllChanges();assert.equal(stored.id,'original-shop');assert.equal(stored.name,'Nombre Nuevo');assert.equal(stored.catalog.length,1);
 context.updateBusinessSlugPreview();assert.equal(fields['input-business-id'].value,'original-shop');
 context.currentCompany={id:'',slug:''};context.updateBusinessSlugPreview();assert.equal(fields['input-business-id'].value,'nombre-nuevo');
 assert.match(html,/await persistBusinessData\(\{ additions: imported \}, true\)/);
 const custom=block('    async function saveCustomBusiness(', '    // =========================================================');assert.doesNotMatch(custom,/catalog:/);assert.match(custom,/await persistBusinessData\(backendPayload\)/);
 console.log('PASS: product persisted, reload retains catalog, failure retains form without fake success, rename preserves business and products, draft slug updates, import awaits persistence.');
})().catch(e=>{console.error(e);process.exitCode=1;});

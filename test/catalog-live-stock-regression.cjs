const fs=require('fs');const vm=require('vm');const assert=require('node:assert/strict');
let stored={id:'shop',catalog:[{id:'sold-product',stock:1,price:10}]};let fail=false;
const context=vm.createContext({config:{storage:{filePath:'local.json'}},path:{dirname:()=>'.'},fs:{existsSync:()=>true},isDbConnected:()=>true,console,Set,Date,JSON,
BusinessModel:{findOneAndUpdate:(filter,update)=>({lean:async()=>{
 if(fail)throw Error('Mongo offline');assert.ok(update.$push);assert.equal(update.$set,undefined);assert.equal(update.catalog,undefined);
 const ids=filter['catalog.id'].$nin;if(stored.catalog.some(p=>ids.includes(p.id)))return null;
 stored.catalog.push(...structuredClone(update.$push.catalog.$each));return structuredClone(stored);
}})}});
const source=fs.readFileSync('src/repositories/business.repository.js','utf8').replace(/^import .*;\r?\n/gm,'').replace('export const businessRepository','const businessRepository');vm.runInContext(source+'\nglobalThis.repo=businessRepository;',context);context.repo._syncLocalRecord=()=>{};
(async()=>{await context.repo.appendCatalog('shop',[{id:'new',name:'Nuevo',stock:4,price:20}]);assert.equal(stored.catalog[0].stock,1);assert.equal(stored.catalog.length,2);await assert.rejects(context.repo.appendCatalog('shop',[{id:'new',stock:4}]),/ya existe/);assert.equal(stored.catalog.length,2);fail=true;await assert.rejects(context.repo.save(stored),/no pudo guardar/);console.log('PASS: additions preserve sold stock, duplicate imports rejected, Mongo save error never becomes local success.');})().catch(e=>{console.error(e);process.exitCode=1;});

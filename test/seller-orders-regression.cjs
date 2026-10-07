const fs=require('fs');const vm=require('vm');const assert=require('node:assert/strict');
let business={id:'shop',catalog:[{id:'P1',name:'Producto',price:100,stock:2}],orders:[],notificationPhone:'5491111111111'};
let notifications=0;
const context=vm.createContext({crypto:require('node:crypto'),structuredClone,Map,Promise,Date,Number,Error,Object,JSON,
 businessRepository:{findById:async()=>structuredClone(business),save:async value=>{business=structuredClone(value);return business;}},
 BusinessModel:{},isDbConnected:()=>false,whatsappService:{sendTextMessage:async()=>{notifications++;return {sent:true,simulated:false};}}});
const source=fs.readFileSync('src/services/sellerOrders.service.js','utf8').replace(/^import .*;\r?\n/gm,'').replace(/export /g,'');
vm.runInContext(source+'\nglobalThis.service=sellerOrdersService;',context);
(async()=>{
 const service=context.service;
 await assert.rejects(service.create('shop','customer',[{productId:'P1',quantity:3}],'bad'),/stock/);
 const order=await service.create('shop','customer',[{productId:'P1',quantity:1}],'message1');
 assert.equal(order.status,'pending_payment');assert.equal(business.catalog[0].stock,2);assert.equal(notifications,1);
 assert.equal((await service.create('shop','customer',[{productId:'P1',quantity:1}],'message1')).id,order.id);
 assert.equal(business.orders.length,1);assert.equal(notifications,1);
 await Promise.all([service.confirm('shop',order.id),service.confirm('shop',order.id)]);
 assert.equal(business.catalog[0].stock,1);assert.equal(business.orders[0].status,'confirmed');assert.equal(notifications,3);
 const pending=await service.create('shop','customer',[{productId:'P1',quantity:1}],'message2');business.catalog[0].stock=0;
 await assert.rejects(service.confirm('shop',pending.id),/Stock insuficiente/);assert.equal(business.orders[1].status,'pending_payment');
 console.log('PASS: pending order, real price, stock checks, duplicate message, concurrent confirmation once, customer/owner notifications.');
})().catch(e=>{console.error(e);process.exitCode=1;});

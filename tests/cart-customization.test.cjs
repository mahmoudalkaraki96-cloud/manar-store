const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
function setup(){
 const storage=new Map(),events=[],tracked=[];
 const sandbox={exports:{},require:()=>({trackEcommerce:(...args)=>tracked.push(args)}),localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},window:{location:{hostname:'manarstore.ps'},dispatchEvent:e=>events.push(e)},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail}},fetch:async()=>({}),crypto:require('node:crypto')};
 const source=ts.transpileModule(fs.readFileSync('app/cart-storage.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(source,sandbox);return {api:sandbox.exports,events,tracked};
}
const product={id:7,itemNumber:1007,name:'منتج مخصص',price:12,inStock:true,stock:20,customFields:[{label:'الاسم',required:true,maxLength:60}]};
test('customization request does not save or track an addition before confirmation',()=>{const {api,events,tracked}=setup();api.addCartItem(product,undefined,2);assert.equal(events.length,1);assert.equal(events[0].type,'manar:customize-cart');assert.equal(events[0].detail.qty,2);assert.equal(Object.keys(api.loadCart()).length,0);assert.equal(tracked.length,0)});
test('confirmation keeps selected variant, quantity and separate customizations',()=>{const {api}=setup(),variant={id:8,name:'ذهبي',sku:'gold',stock:20,price:15};api.addCartItem(product,variant,2,{'الاسم':'سارة'},true,true);api.addCartItem(product,variant,1,{'الاسم':'نور'},true,true);const lines=Object.values(api.loadCart());assert.equal(lines.length,2);assert.equal(lines.reduce((s,l)=>s+l.qty*l.price,0),45);assert.equal(lines[0].variantId,8);assert.equal(lines[0].customizations['الاسم'],'سارة');assert.equal(lines[1].customizations['الاسم'],'نور')});
test('required whitespace is rejected and optional blank customization is accepted',()=>{const {api}=setup();api.addCartItem(product,undefined,1,{'الاسم':'   '},true,true);assert.equal(Object.keys(api.loadCart()).length,0);api.addCartItem({...product,customFields:[{label:'ملاحظة',required:false}]},undefined,1,{},false,true);assert.equal(Object.values(api.loadCart())[0].qty,1)});
test('ordinary products merge normally while sold out products cannot prompt or add',()=>{const {api,events}=setup(),plain={...product,customFields:[]};api.addCartItem(plain);api.addCartItem(plain);assert.equal(Object.values(api.loadCart())[0].qty,2);const n=events.length;api.addCartItem({...product,inStock:false});assert.equal(events.length,n)});


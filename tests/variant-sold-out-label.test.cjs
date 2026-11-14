const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const catalogModule={exports:{}};new Function('module','exports',ts.transpileModule(fs.readFileSync('app/catalog-types.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(catalogModule,catalogModule.exports);
function component(popup=false,language="AR"){let state=0;const module={exports:{}},stubs={
 '../catalog-types':catalogModule.exports,
 '../store-language':{useStoreLanguage:()=>({language,t:(ar,en,he)=>({AR:ar,EN:en,HE:he})[language]})},
 'next/link':({href,children,...props})=>React.createElement('a',{href,...props},children),
 '../storefront-types':{cachedStoreSettings:()=>({})},'../watermark-config':{parseWatermark:()=>({base:'',enabled:false,x:0,y:0,size:0})},
 '../image-utils':{productThumbnail:value=>value||''},'../favorites-storage':{useFavorites:()=>[],toggleFavorite:()=>{}},
};
if(popup){stubs.react={...React,useState:()=>[state++===0?0:1,()=>{}],useRef:value=>({current:value}),useEffect:()=>{}};stubs['react-dom']={createPortal:node=>node};}
const source=fs.readFileSync('app/components/ProductCard.tsx','utf8')+'\nexport {VariantPicker};';new Function('require','module','exports','document',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(name=>name in stubs?stubs[name]:require(name),module,module.exports,{body:{}});return module.exports;}
const variant=(id,name,stock,displayType='text')=>({id,sku:String(id),name,stock,price:20,displayType,color:'#d22'}),base={id:1,itemNumber:1001,name:'Test product',price:20,category:'Test',inStock:true};
const buttons=html=>Array.from(html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g),m=>({attrs:m[1],body:m[2]}));
for(const kind of ['text','color'])test('zero-stock '+kind+' option has a visible sold-out label and stays disabled',()=>{const Card=component().default,p={...base,variants:[variant(1,'Unavailable',0,kind),variant(2,'Available',3,kind)]};const markup=renderToStaticMarkup(React.createElement(Card,{p,settings:{},onAdd:()=>{}})),items=buttons(markup),sold=items.find(b=>b.attrs.includes('Unavailable — منتهي')),available=items.find(b=>b.attrs.includes('aria-label="Available"'));assert.ok(sold);assert.match(sold.attrs,/disabled/);assert.match(sold.body,/<small class="variantSoldOutLabel">منتهي<\/small>/);assert.ok(available);assert.doesNotMatch(available.attrs,/disabled/);assert.doesNotMatch(available.body,/منتهي/);});
test('all exhausted options keep add-to-cart disabled',()=>{const Card=component().default,p={...base,inStock:false,variants:[variant(1,'Empty',0)]};const markup=renderToStaticMarkup(React.createElement(Card,{p,settings:{},onAdd:()=>{}}));assert.match(buttons(markup).find(b=>b.attrs.includes('cardAddButton')).attrs,/disabled/)});
test('picker rejects a selected option whose stock became zero',()=>{const Picker=component(true).VariantPicker,p={...base,variants:[variant(1,'Unavailable',0)]};const markup=renderToStaticMarkup(Picker({p,wholesale:false,onClose:()=>{},onConfirm:()=>{}}));const items=buttons(markup);assert.match(items.find(b=>b.attrs.includes('variantPickerAdd')).attrs,/disabled/);assert.match(items.find(b=>b.attrs.includes('variantPickerText')).body,/منتهي/)});


test('a card without a main photo uses a variant photo; tracking off enables zero-stock choices',()=>{const Card=component().default,p={...base,inventoryEnabled:false,inStock:false,variants:[{...variant(1,'Option',0),image:'/variant-only.webp'}]};const markup=renderToStaticMarkup(React.createElement(Card,{p,settings:{},onAdd:()=>{}}));assert.match(markup,/src="\/variant-only.webp"/);assert.doesNotMatch(markup,/variantSoldOutLabel/);const add=buttons(markup).find(b=>b.attrs.includes('cardAddButton'));assert.doesNotMatch(add.attrs,/disabled/)});

for(const [language, label] of [['EN','Sold out'],['HE','אזל מהמלאי']]){
 test(language+' renders the unavailable variant label',()=>{
  const Card=component(false,language).default;
  const markup=renderToStaticMarkup(React.createElement(Card,{p:{...base,variants:[variant(1,'Unavailable',0),variant(2,'Available',3)]},settings:{}}));
  assert.ok(markup.includes(label));
 });
}

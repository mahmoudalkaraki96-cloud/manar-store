const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function compile(path,imports,window){const module={exports:{}};new Function('require','module','exports','window',ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(name=>{if(!(name in imports))throw Error(name);return imports[name]},module,module.exports,window);return module.exports;}
function fixture(settings={},search='',saved='he',pathname='/'){
 let current={},assigned=null;const storage=new Map([['manar-store-language',saved]]);
 const window={location:{pathname,search,href:'https://shop.example/'+search,assign:value=>assigned=value},localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)}};
 const mod=compile('app/store-language.ts',{'./storefront-types':{cachedStoreSettings:()=>current,loadStorefront:async()=>{current=settings;return {settings}}}},window);
 return {mod,storage,assigned:()=>assigned};
}
test('languages are opt-in per store and Arabic remains available',()=>{
 const profile=compile('shared/store-profile.ts',{});
 assert.equal(profile.normalizeStoreProfile({}).englishEnabled,false);
 assert.equal(profile.normalizeStoreProfile({}).hebrewEnabled,false);
 assert.equal(profile.normalizeStoreProfile({englishEnabled:'true'}).englishEnabled,false);
 assert.equal(profile.validateStoreProfile({englishEnabled:true}).englishEnabled,true);
 assert.deepEqual(fixture().mod.enabledStoreLanguages({}),['ar']);
 assert.deepEqual(fixture().mod.enabledStoreLanguages({englishEnabled:true}),['ar','en']);
});
test('cold first visit waits for current store flags rather than hiding enabled language',async()=>{
 const f=fixture({englishEnabled:true},'?lang=en');assert.equal(f.mod.storeLanguage(),'ar');assert.equal(await f.mod.resolveStoreLanguage(),'en');
 f.mod.selectStoreLanguage('en');assert.match(f.assigned(),/lang=en/);
});
test('disabled URL and saved preferences fall back to Arabic without erasing preferences',async()=>{
 for(const search of ['', '?lang=he']){const f=fixture({englishEnabled:true},search);assert.equal(await f.mod.resolveStoreLanguage(),'ar');f.mod.selectStoreLanguage('he');assert.equal(f.assigned(),null);assert.equal(f.storage.get('manar-store-language'),'he')}
 const enabled=fixture({hebrewEnabled:true});assert.equal(await enabled.mod.resolveStoreLanguage(),'he');
});
test('admin is always Arabic, including when extra storefront languages are enabled',async()=>{
 const f=fixture({englishEnabled:true,hebrewEnabled:true},'?lang=en','he','/admin');assert.equal(await f.mod.resolveStoreLanguage(),'ar');
});

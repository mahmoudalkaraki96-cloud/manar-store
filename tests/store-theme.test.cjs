const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const sandbox={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('shared/store-theme.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);
const {storeThemeCss,validateTheme,normalizeTheme}=sandbox.exports;
test('standard theme keeps the original corner scale; options only change it when chosen',()=>{
 assert.match(storeThemeCss({}),/--theme-radius:1;/);
 assert.match(storeThemeCss({theme:{id:'standard',radius:'sharp'}}),/--theme-radius:0\.4;/);
 assert.match(storeThemeCss({theme:{id:'standard',radius:'round'}}),/--theme-radius:1\.5;/);
 assert.match(storeThemeCss({theme:{id:'standard',radius:'1;}body{display:none'}}),/--theme-radius:1;/);
});
test('theme validation accepts only themes known to this release',()=>{
 // The module runs in its own vm context, so compare plain JSON rather than cross-realm objects.
 const plain=value=>JSON.parse(JSON.stringify(value));
 assert.deepEqual(plain(validateTheme({id:'standard'})),{id:'standard',radius:'standard'});
 for(const value of [null,{},{id:'modern'},{id:'__proto__'},{id:'standard',radius:'huge'},{id:'toString'}])assert.throws(()=>validateTheme(value));
 assert.deepEqual(plain(normalizeTheme({id:'constructor',radius:'hasOwnProperty'})),{id:'standard',radius:'standard'});
});
test('server theme preserves configured colors before client hydration',()=>{
 const css=storeThemeCss({primaryColor:'#123abc',secondaryColor:'#def',backgroundColor:'#fafafa'});
 assert.match(css,/:root\{--green:#123abc;--gold:#def;--pageBg:#fafafa/);
 assert.match(css,/\.storeShell \.shopHeaderWrap,\.storeShellContent>main\{--green:#123abc!important/);
 assert.match(css,/background:#fafafa!important/);
});
test('missing or unsafe colors use neutral defaults and cannot escape a style tag',()=>{
 const css=storeThemeCss({primaryColor:'</style><script>alert(1)</script>',secondaryColor:'red;display:none',backgroundColor:null});
 assert.match(css,/--green:#475569;--gold:#94a3b8;--pageBg:#ffffff/);
 assert.ok(!css.includes('<'));assert.ok(!css.includes('display:none'));
 assert.equal(css,storeThemeCss({}));
});

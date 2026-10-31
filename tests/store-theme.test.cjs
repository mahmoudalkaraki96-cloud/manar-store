const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const sandbox={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('shared/store-theme.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);
const {storeThemeCss}=sandbox.exports;
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

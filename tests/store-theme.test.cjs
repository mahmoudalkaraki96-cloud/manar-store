const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const sandbox={exports:{},URLSearchParams};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('shared/store-theme.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);
const {storeThemeCss,validateTheme,normalizeTheme,previewThemeId,withPreview,setHtmlTheme,themes,themeTokensCss}=sandbox.exports;
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

test('1.9.0: the standard theme writes exactly the CSS it wrote before themes had tokens',()=>{
 assert.equal(storeThemeCss({}),':root{--green:#475569;--gold:#94a3b8;--pageBg:#ffffff;--theme-radius:1;color-scheme:light}body{background:#ffffff}.storeShell .shopHeaderWrap,.storeShellContent>main{--green:#475569!important;--gold:#94a3b8!important}.storeShellContent>main{background:#ffffff!important}');
 assert.equal(themeTokensCss('standard'),'');
});
test('1.9.0: every theme in the registry has a label and only safe --theme-* tokens',()=>{
 for(const [id,theme] of Object.entries(themes)){
  assert.match(id,/^[a-z][a-z0-9-]{1,30}$/,id);assert.ok(theme.label,id);
  for(const [name,value] of Object.entries(theme.tokens)){assert.match(name,/^--theme-[a-z][a-z0-9-]*$/,id+' '+name);assert.doesNotMatch(value,/[<>{};\\]/,id+' '+name)}
  assert.equal(themeTokensCss(id).split(';').filter(Boolean).length,Object.keys(theme.tokens).length,id+': no token dropped');
 }
});
test('1.9.0: a preview link accepts only known themes and keeps the store corner setting',()=>{
 assert.equal(previewThemeId('?theme_preview=standard'),'standard');
 for(const search of ['','?theme_preview=','?theme_preview=__proto__','?theme_preview=toString','?theme_preview=%22%3E%3Cscript%3E','?theme=standard'])assert.equal(previewThemeId(search),null,search);
 assert.deepEqual(JSON.parse(JSON.stringify(withPreview({id:'standard',radius:'round'},'standard'))),{id:'standard',radius:'round'});
 assert.deepEqual(JSON.parse(JSON.stringify(withPreview({id:'gone',radius:'sharp'},null))),{id:'standard',radius:'sharp'});
});
test('1.9.0: the theme is written on <html> once, next to the language, and marks previews',()=>{
 const page='<!doctype html><html lang="ar" dir="rtl" data-theme="old" data-theme-preview=\'x\'><head></head><body></body></html>';
 assert.equal(setHtmlTheme(page,'standard',false),'<!doctype html><html lang="ar" dir="rtl" data-theme="standard"><head></head><body></body></html>');
 assert.match(setHtmlTheme('<html><head>','standard',true),/^<html data-theme="standard" data-theme-preview="standard"><head>/);
});
test('1.9.0: the server and the page agree on the theme, and previews are never indexed',()=>{
 const worker=fs.readFileSync('worker/index.ts','utf8'),client=fs.readFileSync('app/components/StoreTheme.tsx','utf8');
 assert.match(worker,/setHtmlTheme\(applyDocumentLanguage\(/);
 assert.match(worker,/if\(preview\)robots="noindex,nofollow"/);
 assert.match(client,/withPreview\(settings\.theme,knownThemeId\(document\.documentElement\.dataset\.themePreview\)\)/);
 assert.match(client,/dataset\.theme=theme\.id/);
 assert.match(fs.readFileSync('platform/control/themes-ui.ts','utf8'),/\?theme_preview='\+encodeURIComponent\(theme\.value\)/);
});

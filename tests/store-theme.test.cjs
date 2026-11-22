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

test('1.9.1: the rooms theme is registered with a safe font and its own scoped stylesheet',()=>{
 const {themeFontLink}=sandbox.exports;
 assert.equal(themes.rooms.label,'غرف البيت');
 assert.match(themeFontLink('rooms'),/^<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin><link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2\?family=Almarai:wght@400;700;800&display=swap">$/);
 assert.equal(themeFontLink('standard'),'','the standard theme keeps the store font and adds nothing');
 assert.match(storeThemeCss({theme:{id:'rooms',radius:'standard'}}),/--theme-font:Almarai;/);
 // Every rule in a theme stylesheet must be scoped to that theme so other stores are untouched.
 const css=fs.readFileSync('app/themes/rooms.css','utf8').replace(/\/\*[\s\S]*?\*\//g,'');
  // Animations are allowed only under a theme-prefixed name (1.9.3).
 const frames=[...css.matchAll(/@keyframes\s+([\w-]+)/g)].map(m=>m[1]);for(const name of frames)assert.match(name,/^rooms[A-Z]/,name);
 const selectors=css.replace(/@keyframes\s+[\w-]+\{(?:[^{}]*\{[^}]*\})*\s*\}/g,'').replace(/@media[^{]*\{/g,'').split('}').map(block=>block.split('{')[0].trim()).filter(Boolean);
 assert.ok(selectors.length>40);
 for(const group of selectors)for(const selector of group.split(','))assert.match(selector.trim(),/^html\[data-theme="rooms"\]/,selector);
 assert.match(fs.readFileSync('app/layout.tsx','utf8'),/import "\.\/themes\/rooms\.css";/);
 assert.match(fs.readFileSync('worker/index.ts','utf8'),/const head=themeFontLink\(theme\.id\)\+/);
});
test('1.9.1: room cards appear only on the rooms theme and the cart bar photos stay hidden elsewhere',()=>{
 const home=fs.readFileSync('app/page.tsx','utf8');
 assert.match(home,/themeId==="rooms"&&<RoomCards categories=\{data\.categories\} products=\{data\.products\}\/>/);
 assert.match(home,/<section className="homeRow" data-row=\{href\|\|""\}>/);
 assert.match(fs.readFileSync('app/sticky-cart.css','utf8'),/\.stickyCartThumbs\{display:none\}/);
});

test("1.9.3: rooms theme fixes phone search, shows loading and keeps scrolling light",()=>{
 const css=fs.readFileSync("app/themes/rooms.css","utf8");
 assert.match(css,/@media\(max-width:720px\)\{\s*html\[data-theme="rooms"\] \.globalSearch\{position:relative\}\s*html\[data-theme="rooms"\] \.globalSearchPanel\{position:absolute!important;top:calc\(100% \+ 8px\)!important/,"search panel opens under the search box");
 assert.match(css,/img\[data-card-image\]:not\(\[data-loaded\]\)\)::before/,"photos shimmer until loaded");
 assert.match(css,/\.storeState:not\(\.error\)::before/,"loading spinner");
 assert.match(css,/backdrop-filter:none!important/,"no blur behind the sticky header");
 assert.doesNotMatch(css,/100vmax var\(--r-band\)|clip-path:inset\(0 -100vmax\)/,"band without huge shadow");
 const card=fs.readFileSync("app/components/ProductCard.tsx","utf8");
 assert.match(card,/data-card-image="" onLoad=\{event=>\{event\.currentTarget\.dataset\.loaded="1"\}\}/);
});

test("1.9.3: the category bar marks the current category and the rooms theme shows it as a filled chip",()=>{
 const header=fs.readFileSync("app/components/StoreHeader.tsx","utf8");
 assert.match(header,/aria-current=\{current\?"page":undefined\}/);
 assert.match(header,/children\.some\(x=>pathname===`\/category\/\$\{x\.slug\}`\)/,"a sub-category page highlights its parent");
 const css=fs.readFileSync("app/themes/rooms.css","utf8");
 assert.match(css,/\.categoryBar \.catItem>a\[aria-current="page"\]\{background:var\(--green\)!important;color:#fff!important/);
 assert.doesNotMatch(css,/article\.product\{border:1px/,"cards stay frameless; the photo tile carries the edge");
});

test("1.9.4: rooms card order is name, price, options, button, with the button lined up at the bottom",()=>{
 const css=fs.readFileSync("app/themes/rooms.css","utf8");
 assert.match(css,/\.product \.productInfo>a\{order:1;/);
 assert.match(css,/\.product \.price\{order:2;/);
 assert.match(css,/\.product \.cardVariantChoices\{order:3;display:flex!important;flex-wrap:nowrap!important/);
 assert.match(css,/\.product \.cardAddButton\{order:4;margin-top:auto!important/);
 assert.match(css,/-webkit-line-clamp:2;/);
 assert.match(css,/\.cardVariantChoices \.variantPrefix\{display:none\}/,"rooms chips hide the repeated «اللون:» prefix");
 const card=fs.readFileSync("app/components/ProductCard.tsx","utf8");
 assert.match(card,/<span className="variantPrefix">\{parts\.prefix\} <\/span>/,"other themes keep the full option text");
});

test("1.9.5: rooms phone product page puts price and favourite on one line, quantity beside the button, and drops the duplicate heading",()=>{
 const css=fs.readFileSync("app/themes/rooms.css","utf8");
 const block=css.slice(css.indexOf("/* 1.9.5:"));
 assert.match(block,/^\/\* 1\.9\.5:[^\n]*\n@media\(max-width:859px\)\{/,"phone only; desktop layout unchanged");
 assert.match(block,/\.productPage \.details\{display:flex!important;flex-direction:row!important;flex-wrap:wrap!important/);
 assert.match(block,/\.details>\.bigPrice\{order:2;/);
 assert.match(block,/\.details>\.detailFav\{order:3;/);
 assert.match(block,/\.quantityControl>span\{display:none!important\}/);
 assert.match(block,/\.productSectionDivider\{display:none!important\}/);
});

test("1.9.6: switching products keeps the header mounted and shows a loaded product without a loading screen",()=>{
 const page=fs.readFileSync("app/product/[id]/page.tsx","utf8");
 assert.doesNotMatch(page,/<ProductDetail key=/,"a key would remount the header on every product");
 assert.match(page,/if\(shownId!==productId\)\{const preview=productPreview\(productId\);/);
 assert.match(page,/setVariant\(undefined\);setImageIndex\(0\);setQty\(1\);setZoom\(""\);setLoading\(!preview\);setCustomizations\(\{\}\)/,"old product state is reset");
 assert.match(page,/\[loading,setLoading\]=useState\(\(\)=>!productPreview\(productId\)\)/);
 const views=fs.readFileSync("app/catalog-views.ts","utf8");
 assert.match(views,/return cache\.get\(\)\.then\(remember\);/);
 assert.match(views,/export function productPreview\(/);
});

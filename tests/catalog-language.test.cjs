const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),ts=require("typescript");
const catalog={exports:{}};
new Function("module","exports",ts.transpileModule(fs.readFileSync("app/catalog-types.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(catalog,catalog.exports);
const {variantText,variantParts,optionTitle}=catalog.exports;
const read=file=>fs.readFileSync(file,"utf8");

test("1.9.4: variant names follow the visitor's language and fall back to the source text",()=>{
 const v={name:"اللون: أبيض",translations:{HE:{name:"לבן"}}};
 assert.equal(variantText(v,"HE"),"לבן");
 assert.equal(variantText(v,"EN"),"اللون: أبيض");
 assert.deepEqual({...variantParts("اللون: أبيض")},{prefix:"اللون:",value:"أبيض"});
 assert.deepEqual({...variantParts("White / Width 20 cm")},{prefix:"",value:"White / Width 20 cm"});
 assert.equal(optionTitle({variantName:"اللون"},"AR","AR","الخيار"),"اللون");
 assert.equal(optionTitle({variantName:"اللون"},"HE","AR","אפשרות"),"אפשרות","the source-language title is not shown to other languages");
});

test("1.9.4: product card, search, product page, menu and breadcrumbs show translated names",()=>{
 const card=read("app/components/ProductCard.tsx"),header=read("app/components/StoreHeader.tsx"),page=read("app/product/[id]/page.tsx");
 for(const [name,src] of [["card",card],["header",header],["product page",page]])assert.doesNotMatch(src,/>\{(v|item)\.name\}/,name+" renders a raw variant name");
 assert.match(card,/optionTitle\(p,language,sourceCode/);
 assert.match(header,/const name=catalogText\(p,language,"name"\)\|\|p\.name;/);
 assert.match(page,/catalogText\(product,language,"description"\)/);
 assert.match(page,/catalogText\(category,language,"name"\)\|\|category\.name/);
 assert.match(page,/catalogText\(parent,language,"name"\)\|\|parent\.name/);
 assert.match(read("app/components/MobileMenu.tsx"),/catalogText\(x,language,"name"\)\|\|x\.name/);
 assert.match(read("app/category/[slug]/page.tsx"),/catalogText\(item,language,"name"\)\|\|item\.name/);
});

test("1.9.4: the header search shows it is searching before it says nothing was found",()=>{
 const header=read("app/components/StoreHeader.tsx");
 assert.match(header,/setSearching\(true\)/);
 assert.match(header,/\.finally\(\(\)=>\{if\(alive\)setSearching\(false\)\}\)/);
 assert.match(header,/searching\?<div className="searchPanelLoading" role="status">\{t\("search\.searching"\)\}<\/div>:!categoryResults\.length&&<div className="noSearchResults">/);
 assert.match(read("app/globals.css"),/\.globalSearchPanel \.searchPanelLoading::before\{/);
});

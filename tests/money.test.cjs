const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),ts=require("typescript");
const load=file=>{const mod={exports:{}};new Function("module","exports","require",ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(mod,mod.exports,name=>name.startsWith("./")?load("shared/"+name.slice(2)+".ts"):require(name));return mod.exports};
const money=load("shared/money.ts"),profile=load("shared/store-profile.ts");

test("prices follow the store currency and the visitor language, with Latin digits by default",()=>{
 const ils={currency:"ILS",digits:"latn"};
 assert.equal(money.formatMoney(1234.5,ils,"en"),"₪1,234.5");
 assert.match(money.formatMoney(20,ils,"ar"),/^[^\d]*20[^\d]*₪$/);
 assert.match(money.formatMoney(20,{currency:"JOD",digits:"latn"},"en"),/JOD\s?20/);
 assert.doesNotMatch(money.formatMoney(20,ils,"ar"),/[٠-٩]/);
});

test("the store can choose the language's own digits and a custom symbol",()=>{
 assert.match(money.formatMoney(20,{currency:"ILS",digits:"arab"},"ar"),/[٠-٩]/);
 assert.match(money.formatMoney(20,{currency:"ILS",digits:"arab"},"en"),/[٠-٩]/);
 assert.equal(money.formatMoney(20,{currency:"ILS",currencySymbol:"شيكل",digits:"latn"},"en"),"شيكل20");
 assert.match(money.formatMoney(20,{currency:"ILS",currencySymbol:"شيكل",digits:"latn"},"ar"),/20\s*شيكل/);
 assert.equal(money.formatMoneyRange(5,5,{currency:"ILS"},"en"),"₪5");
 assert.equal(money.formatMoneyRange(5,9,{currency:"ILS"},"en"),"₪5 – ₪9");
 assert.match(money.formatDate(Date.UTC(2026,10,16,12),"en","latn"),/Nov 16, 2026/);
});

test("currency settings are validated and existing stores keep shekels with Latin digits",()=>{
 assert.equal(profile.emptyProfile.currency,"ILS");
 assert.equal(profile.emptyProfile.digits,"latn");
 assert.equal(profile.normalizeStoreProfile({currency:"jod",digits:"arab",currencySymbol:" د.أ "}).currency,"JOD");
 assert.equal(profile.normalizeStoreProfile({currency:"XXXX"}).currency,"ILS");
 for(const bad of [{currency:"XX"},{currency:"12A"},{currencySymbol:"123456789"},{digits:"roman"}])assert.throws(()=>profile.validateStoreProfile(bad));
 assert.equal(profile.validateStoreProfile({currency:"usd",digits:"arabext"}).currency,"USD");
});

test("storefront code has no fixed currency symbol, currency code or date/number locale",()=>{
 const found=[];
 (function walk(folder){for(const entry of fs.readdirSync(folder,{withFileTypes:true})){const full=path.join(folder,entry.name);if(entry.isDirectory()){if(entry.name!=="admin")walk(full);continue}
  if(!/\.tsx?$/.test(entry.name))continue;
  const text=fs.readFileSync(full,"utf8");
  for(const [label,pattern] of [["shekel sign",/₪/],["fixed ILS",/["']ILS["']/],["fixed date locale",/toLocale(?:Date|Time)?String\(\s*["']/],["fixed number locale",/NumberFormat\(\s*["']/]])
   if(pattern.test(text))found.push(`${full.replace(/\\/g,"/")}: ${label}`);
 }})("app");
 assert.deepEqual(found,[]);
});

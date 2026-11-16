const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {stripTypeScriptTypes}=require("node:module"),{DatabaseSync}=require("node:sqlite"),{pathToFileURL}=require("node:url");

const dir=fs.mkdtempSync(path.join(os.tmpdir(),"ui-texts-"));
const strip=(from,to,replace=[])=>{let code=stripTypeScriptTypes(fs.readFileSync(from,"utf8"),{mode:"transform"});for(const [a,b] of replace)code=code.replace(a,b);fs.writeFileSync(path.join(dir,to),code)};
strip("shared/ui-message-defaults.ts","defaults.mjs");
strip("shared/ui-messages.ts","messages.mjs",[['"./ui-message-defaults"','"./defaults.mjs"']]);
strip("worker/ui-texts.ts","worker.mjs",[['"../shared/ui-messages"','"./messages.mjs"']]);
const load=name=>import(pathToFileURL(path.join(dir,name)).href);
const messages=load("messages.mjs"),worker=load("worker.mjs"),defaults=load("defaults.mjs");

function database(){
 const sql=new DatabaseSync(":memory:");
 sql.exec(fs.readFileSync("drizzle/0038_ui_texts.sql","utf8"));
 const statement=query=>({query,values:[],bind(...values){this.values=values;return this},async all(){return {results:sql.prepare(query).all(...this.values)}},async run(){return sql.prepare(query).run(...this.values)}});
 return {sql,prepare:statement,async batch(list){sql.exec("BEGIN");try{for(const s of list)sql.prepare(s.query).run(...s.values);sql.exec("COMMIT")}catch(error){sql.exec("ROLLBACK");throw error}}};
}

test("every default text has Arabic, English and Hebrew, and placeholders match across languages",async()=>{
 const {uiMessageDefaults}=await defaults;
 assert.ok(Object.keys(uiMessageDefaults).length>400);
 for(const [key,value] of Object.entries(uiMessageDefaults)){
  for(const code of ["AR","EN","HE"])assert.ok(value[code]&&value[code].trim(),`${key} ${code}`);
  const vars=text=>[...text.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort().join(",");
  assert.equal(vars(value.EN),vars(value.AR),key);assert.equal(vars(value.HE),vars(value.AR),key);
 }
});

test("lookup order: store text, default, then the source language, then the key",async()=>{
 const {interfaceText}=await messages;
 const texts={EN:{"header.cart":"Basket"},AR:{"header.track":"تتبع طلبك"}};
 assert.equal(interfaceText(texts,"header.cart","EN","AR"),"Basket");
 assert.equal(interfaceText(texts,"header.favorites","EN","AR"),"Favorites");
 assert.equal(interfaceText(texts,"header.track","FR","AR"),"تتبع طلبك");
 assert.equal(interfaceText({},"header.track","FR","AR"),"تتبع الطلب");
 assert.equal(interfaceText({},"no.such.key","EN","AR"),"no.such.key");
 assert.equal(interfaceText({},"slider.slide","EN","AR",{number:3}),"Slide 3");
});

test("owner texts are saved per language, cleared with an empty value, and validated before writing",async()=>{
 const {saveUiTexts,loadUiTexts}=await worker,{UiTextError}=await messages,db=database();
 await saveUiTexts(db,{EN:{"header.cart":"  Basket  "},FR:{"header.cart":"Panier"}},["AR","EN","FR"]);
 assert.deepEqual(await loadUiTexts(db),{EN:{"header.cart":"Basket"},FR:{"header.cart":"Panier"}});
 assert.deepEqual(await loadUiTexts(db,["FR"]),{FR:{"header.cart":"Panier"}});
 await saveUiTexts(db,{EN:{"header.cart":""}},["AR","EN","FR"]);
 assert.deepEqual(await loadUiTexts(db),{FR:{"header.cart":"Panier"}});
 for(const input of [null,[],{DE:{"header.cart":"x"}},{EN:{"not.a.key":"x"}},{EN:{"header.cart":5}},{EN:{"header.cart":"x".repeat(2001)}},{EN:[]}])
  await assert.rejects(saveUiTexts(db,input,["AR","EN","FR"]),UiTextError);
 assert.deepEqual(await loadUiTexts(db),{FR:{"header.cart":"Panier"}});
});

test("storefront code has no inline Arabic interface text outside the reviewed owner-only spots",()=>{
 const ts=require("typescript"),AR=/[؀-ۿ]/,found=[];
 // Owner-only controls (dashboard notifications, admin install button) stay Arabic by decision; Arabic search
 // normalisation characters and developer error messages are not interface text; page metadata is replaced at runtime.
 const allowed={
  "app/components/AdminNotificationButton.tsx":null,
  "app/catalog-types.ts":["ا","ه","ي","تعذر تحميل بيانات المتجر"],
  "app/storefront-types.ts":["المتجر","تعذر تحميل إعدادات المتجر"],
  "app/policy-types.ts":["استقبال الطلبات","التوصيل","إلغاء الطلب","الاستبدال وفحص المنتج","تعذر تحميل سياسات المتجر"],
  "app/layout.tsx":["المتجر","%s | المتجر"],
  "app/search/page.tsx":["نتائج البحث"],
  "app/components/StoreTheme.tsx":["`${name} – لوحة التحكم`"],
  "app/components/PwaRegister.tsx":["إدارة المتجر","المتجر","تثبيت لوحة التحكم","إخفاء الزر؛ يمكنك إظهاره من إعدادات لوحة التحكم"],
  "app/components/Notifications.tsx":["تمت جدولة الإشعار التجريبي؛ انتظر ظهوره على الجهاز.","تمت جدولة الإشعار لـ","جهاز مشترك بالعروض.","لوحة التحكم","المتجر","استقبل إشعارًا عند وصول طلب جديد.","الطلبات الجديدة","إرسال إشعار تجريبي","تفعيل وإرسال إشعار تجريبي","حالة إشعارات الإدارة","أجهزة مشتركة للطلبات:","أُرسلت لمزود الإشعارات:","· قيد الإرسال:","· فشلت:","· انتهت صلاحيتها:","«أُرسلت» تعني أن مزود الإشعارات قبلها، ولا تؤكد ظهورها على الجهاز.","آخر سبب مسجل لفشل تجربة:","إرسال إشعار عروض للمشتركين (","جهاز)","الإرسال يصل فقط للأجهزة التي وافقت على إشعارات العروض.","عنوان الإشعار","نص الإشعار","رابط داخل الموقع","راجعت الإشعار وأوافق على إرساله للمشتركين بالعروض.","إرسال إشعار العروض"],
 };
 (function walk(folder){for(const entry of fs.readdirSync(folder,{withFileTypes:true})){const full=path.join(folder,entry.name);if(entry.isDirectory()){if(entry.name!=="admin")walk(full);continue}
  if(!/\.tsx?$/.test(entry.name))continue;
  const rel=full.replace(/\\/g,"/"),allow=allowed[rel];if(allow===null)continue;
  const sf=ts.createSourceFile(full,fs.readFileSync(full,"utf8"),ts.ScriptTarget.Latest,true,entry.name.endsWith("x")?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  (function visit(node){
   let text=null;
   if(ts.isStringLiteralLike(node)||ts.isJsxText(node))text=node.text.replace(/\s+/g," ").trim();
   else if(ts.isTemplateExpression(node))text=node.getText();
   if(text!==null&&AR.test(text)&&!(allow||[]).includes(text))found.push(`${rel}: ${text.slice(0,60)}`);
   if(!ts.isTemplateExpression(node))ts.forEachChild(node,visit);
  })(sf);
 }})("app");
 assert.deepEqual(found,[]);
});

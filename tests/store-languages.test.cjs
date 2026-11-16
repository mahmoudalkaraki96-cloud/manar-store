const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {stripTypeScriptTypes}=require("node:module"),{DatabaseSync}=require("node:sqlite");

// Strip both TypeScript modules into a temp folder so the worker module can import the shared one.
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"store-languages-"));
fs.writeFileSync(path.join(dir,"shared.mjs"),stripTypeScriptTypes(fs.readFileSync("shared/store-languages.ts","utf8"),{mode:"transform"}));
fs.writeFileSync(path.join(dir,"worker.mjs"),stripTypeScriptTypes(fs.readFileSync("worker/store-languages.ts","utf8"),{mode:"transform"}).replace('"../shared/store-languages"','"./shared.mjs"'));
const {pathToFileURL}=require("node:url");
const shared=import(pathToFileURL(path.join(dir,"shared.mjs")).href),worker=import(pathToFileURL(path.join(dir,"worker.mjs")).href);
const migration=fs.readFileSync("drizzle/0037_store_languages.sql","utf8");

function database({english=0,hebrew=0,migrate=true}={}){
 const sql=new DatabaseSync(":memory:");
 sql.exec(`CREATE TABLE store_settings(id INTEGER PRIMARY KEY,english_enabled INTEGER NOT NULL DEFAULT 0,hebrew_enabled INTEGER NOT NULL DEFAULT 0);INSERT INTO store_settings VALUES(1,${english},${hebrew})`);
 if(migrate)sql.exec(migration);
 const statement=query=>({query,values:[],bind(...values){this.values=values;return this},async all(){return {results:sql.prepare(query).all(...this.values)}},async first(){return sql.prepare(query).get(...this.values)??null},async run(){return sql.prepare(query).run(...this.values)}});
 return {sql,prepare:statement,async batch(list){sql.exec("BEGIN");try{for(const s of list)sql.prepare(s.query).run(...s.values);sql.exec("COMMIT")}catch(error){sql.exec("ROLLBACK");throw error}}};
}
const ar={code:"AR",name:"العربية",dir:"rtl",enabled:true,isDefault:true,isSource:true};

test("migration carries the existing English/Hebrew switches into data",async()=>{
 const {loadStoreLanguages}=await worker,db=database({english:1,hebrew:0});
 const list=await loadStoreLanguages(db);
 assert.deepEqual(list.map(item=>[item.code,item.enabled,item.isDefault,item.isSource,item.dir]),[["AR",true,true,true,"rtl"],["EN",true,false,false,"ltr"],["HE",false,false,false,"rtl"]]);
});

test("a store upgraded without the seed gets the same data on first read",async()=>{
 const {loadStoreLanguages}=await worker,db=database({hebrew:1,migrate:false});
 const list=await loadStoreLanguages(db);
 assert.deepEqual(list.filter(item=>item.enabled).map(item=>item.code),["AR","HE"]);
});

test("a store can add a new language, change the default and the source, and order them",async()=>{
 const {loadStoreLanguages,saveStoreLanguages}=await worker,db=database();
 await saveStoreLanguages(db,[{code:"en",name:"English",dir:"ltr",enabled:true,isDefault:true,isSource:false},{...ar,isDefault:false},{code:"fr",name:"Français",dir:"ltr",enabled:true}]);
 const list=await loadStoreLanguages(db);
 assert.deepEqual(list.map(item=>item.code),["EN","AR","FR"]);
 assert.equal(list.find(item=>item.isDefault).code,"EN");
 assert.equal(list.find(item=>item.isSource).code,"AR");
 assert.equal(db.sql.prepare("SELECT COUNT(*) n FROM store_languages WHERE code='HE'").get().n,0);
 assert.deepEqual({...db.sql.prepare("SELECT english_enabled,hebrew_enabled FROM store_settings").get()},{english_enabled:1,hebrew_enabled:0});
});

test("invalid lists are rejected before any write",async()=>{
 const {saveStoreLanguages}=await worker,{StoreLanguageError}=await shared,db=database({english:1});
 const before=db.sql.prepare("SELECT * FROM store_languages ORDER BY code").all();
 for(const input of [[],null,[{...ar,isDefault:false}],[ar,{...ar}],[ar,{code:"E N",name:"x",dir:"ltr"}],[ar,{code:"FR",name:"",dir:"ltr"}],[ar,{code:"FR",name:"Français",dir:"up"}],[{...ar,enabled:false}],[ar,{code:"FR",name:"F",dir:"ltr",isSource:true}]])
  await assert.rejects(saveStoreLanguages(db,input),StoreLanguageError);
 assert.deepEqual(db.sql.prepare("SELECT * FROM store_languages ORDER BY code").all(),before);
});

test("the database refuses two default languages even outside the dashboard",()=>{
 const db=database();
 assert.throws(()=>db.sql.exec("UPDATE store_languages SET is_default=1 WHERE code='EN'"));
});

test("translations keep languages that were not submitted and ignore unknown ones",async()=>{
 const {mergeTranslations}=await worker;
 const merged=mergeTranslations({EN:{name:"Old"},HE:{name:"ישן"}},{EN:{name:"New"},XX:{name:"bad"}},["EN","HE","FR"],["name"],60);
 assert.deepEqual(merged,{EN:{name:"New"},HE:{name:"ישן"}});
});

test("the page opens in the store's own default language and direction",async()=>{
 const {applyDocumentLanguage,setHtmlLanguage}=await worker,{validateStoreLanguages}=await shared;
 const languages=validateStoreLanguages([{...ar,isDefault:false},{code:"EN",name:"English",dir:"ltr",enabled:true,isDefault:true}]);
 const html=applyDocumentLanguage('<!DOCTYPE html><html lang="ar" dir="rtl"><head><title>x</title></head><body></body></html>',languages);
 assert.match(html,/<html lang="en" dir="ltr">/);
 assert.match(html,/<head><script id="storefront-languages" type="application\/json">/);
 assert.equal((html.match(/\slang=/g)||[]).length,1);
 assert.match(setHtmlLanguage("<html><head></head></html>","ar","rtl"),/<html lang="ar" dir="rtl">/);
});

test("storefront code does not hardcode language codes or text direction",()=>{
 const files=[];const walk=folder=>{for(const entry of fs.readdirSync(folder,{withFileTypes:true})){const full=path.join(folder,entry.name);if(entry.isDirectory()){if(entry.name!=="admin")walk(full)}else if(/\.(tsx?|css)$/.test(entry.name))files.push(full)}};
 walk("app");walk("worker");
 // Arabic-only owner tools (dashboard widgets, the owner's preview banner) may keep a fixed direction.
 const ownerOnly=/admin|watermark/i,ownerFiles=new Set(["preview.ts","admin-notification-button.css"]);
 const offenders=[];
 for(const file of files){
  const text=fs.readFileSync(file,"utf8"),name=path.basename(file);
  if(/language\s*[!=]==?\s*["'](?:AR|EN|HE)["']/.test(text))offenders.push(`${file}: language code check`);
  if(/\[\s*["']EN["']\s*,\s*["']HE["']\s*\]|["']EN["']\s*\|\s*["']HE["']/.test(text))offenders.push(`${file}: fixed language list`);
  if(/<html[^>]*\sdir=/.test(text))offenders.push(`${file}: fixed <html> direction`);
  if(ownerFiles.has(name))continue;
  for(const rule of text.matchAll(/([^{}]*)\{([^{}]*direction\s*:\s*["']?rtl[^{}]*)\}/g))if(!ownerOnly.test(rule[1]))offenders.push(`${file}: fixed direction in ${rule[1].trim().slice(-60)}`);
  if(/\.tsx?$/.test(name)&&/direction\s*:\s*["']rtl["']/.test(text))offenders.push(`${file}: fixed inline direction`);
 }
 assert.deepEqual(offenders,[]);
});

test("language helpers derive everything from the list",async()=>{
 const {validateStoreLanguages,translationLanguages,languageDirection,languageTag,defaultLanguage}=await shared;
 const list=validateStoreLanguages([ar,{code:"he",name:"עברית",dir:"rtl",enabled:false},{code:"pt-br",name:"Português",dir:"ltr",enabled:true}]);
 assert.deepEqual(translationLanguages(list).map(item=>item.code),["PT-BR"]);
 assert.equal(languageDirection(list,"PT-BR"),"ltr");
 assert.equal(languageTag("PT-BR"),"pt-BR");
 assert.equal(defaultLanguage(list).code,"AR");
});

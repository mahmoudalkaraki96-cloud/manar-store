import {defaultLanguage,languageTag,readStoreLanguages,translationLanguages,validateStoreLanguages,type StoreLanguage} from "../shared/store-languages";

type Statement={bind(...values:unknown[]):Statement;all<T=Record<string,unknown>>():Promise<{results:T[]}>;first<T=Record<string,unknown>>():Promise<T|null>;run():Promise<unknown>};
type Database={prepare(query:string):Statement;batch(statements:Statement[]):Promise<unknown>};
type LanguageRow={code:string;name:string;dir:string;enabled:number;is_default:number;is_source:number;sort_order:number};

const SCHEMA=[
  "CREATE TABLE IF NOT EXISTS store_languages (code TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, dir TEXT NOT NULL CHECK (dir IN ('rtl','ltr')), enabled INTEGER NOT NULL DEFAULT 1, is_default INTEGER NOT NULL DEFAULT 0, is_source INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0)",
  "CREATE UNIQUE INDEX IF NOT EXISTS store_languages_single_default ON store_languages(is_default) WHERE is_default = 1",
  "CREATE UNIQUE INDEX IF NOT EXISTS store_languages_single_source ON store_languages(is_source) WHERE is_source = 1",
];
// One-time carry-over of the pre-1.8.0 english/hebrew switches into data; identical to migration 0037.
// Runs only when a store's table is empty (e.g. a store upgraded through the unified schema path).
const LEGACY_SEED=[
  "INSERT OR IGNORE INTO store_languages(code,name,dir,enabled,is_default,is_source,sort_order) VALUES ('AR','العربية','rtl',1,1,1,0)",
  "INSERT OR IGNORE INTO store_languages(code,name,dir,enabled,is_default,is_source,sort_order) VALUES ('EN','English','ltr',COALESCE((SELECT english_enabled FROM store_settings WHERE id=1),0),0,0,1)",
  "INSERT OR IGNORE INTO store_languages(code,name,dir,enabled,is_default,is_source,sort_order) VALUES ('HE','עברית','rtl',COALESCE((SELECT hebrew_enabled FROM store_settings WHERE id=1),0),0,0,2)",
];

function fromRow(row:LanguageRow){
  return {code:row.code,name:row.name,dir:row.dir,enabled:Number(row.enabled)!==0,isDefault:Number(row.is_default)!==0,isSource:Number(row.is_source)!==0,sortOrder:Number(row.sort_order)||0};
}
async function selectRows(db:Database){
  return (await db.prepare("SELECT code,name,dir,enabled,is_default,is_source,sort_order FROM store_languages ORDER BY sort_order,code").all<LanguageRow>()).results;
}

export async function loadStoreLanguages(db:Database):Promise<StoreLanguage[]>{
  let rows:LanguageRow[]=[];
  try{rows=await selectRows(db)}catch{
    for(const sql of SCHEMA)await db.prepare(sql).run();
  }
  if(!rows.length){
    for(const sql of LEGACY_SEED)await db.prepare(sql).run();
    rows=await selectRows(db);
  }
  return readStoreLanguages(rows.map(fromRow));
}

/** Codes accepted for stored translations: every configured language except the source content language. */
export async function translatableCodes(db:Database){
  const list=await loadStoreLanguages(db),source=list.find(item=>item.isSource)?.code;
  return list.filter(item=>item.code!==source).map(item=>item.code);
}
export async function enabledTranslationCodes(db:Database){
  return translationLanguages(await loadStoreLanguages(db)).map(item=>item.code);
}

/** Replaces the store's language list atomically. Validation errors are thrown before any write. */
export async function saveStoreLanguages(db:Database,input:unknown,now=Date.now()){
  const list=validateStoreLanguages(input);
  await loadStoreLanguages(db);
  const placeholders=list.map(()=>"?").join(",");
  const statements=[
    db.prepare(`DELETE FROM store_languages WHERE code NOT IN (${placeholders})`).bind(...list.map(item=>item.code)),
    // Clear flags first so the single-default/single-source unique indexes never see two rows at once.
    db.prepare("UPDATE store_languages SET is_default=0,is_source=0"),
    ...list.map(item=>db.prepare("INSERT INTO store_languages(code,name,dir,enabled,is_default,is_source,sort_order,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(code) DO UPDATE SET name=excluded.name,dir=excluded.dir,enabled=excluded.enabled,is_default=excluded.is_default,is_source=excluded.is_source,sort_order=excluded.sort_order,updated_at=excluded.updated_at")
      .bind(item.code,item.name,item.dir,item.enabled?1:0,item.isDefault?1:0,item.isSource?1:0,item.sortOrder,now)),
    // Keep the pre-1.8.0 columns in step so rolling back to 1.7.x shows the same EN/HE state.
    db.prepare("UPDATE store_settings SET english_enabled=?,hebrew_enabled=? WHERE id=1")
      .bind(list.some(item=>item.code==="EN"&&item.enabled)?1:0,list.some(item=>item.code==="HE"&&item.enabled)?1:0),
  ];
  await db.batch(statements);
  return list;
}

const attribute=(value:string)=>value.replace(/[&"<>]/g,char=>({"&":"&amp;",'"':"&quot;","<":"&lt;",">":"&gt;"})[char]||char);

/** Replaces any lang/dir on the <html> tag. */
export function setHtmlLanguage(html:string,tag:string,dir:"rtl"|"ltr"){
  return html.replace(/<html\b([^>]*)>/i,(_match,attrs:string)=>"<html"+attrs.replace(/\s(?:lang|dir)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,"")+' lang="'+attribute(tag)+'" dir="'+dir+'">');
}

/**
 * Puts the store's own default language and direction on <html> before the page reaches the browser,
 * then lets a tiny inline script switch to the visitor's saved language before first paint.
 * The language list is embedded so the client provider starts with real data instead of a guess.
 */
export function applyDocumentLanguage(html:string,languages:StoreLanguage[]){
  const fallback=defaultLanguage(languages);
  const data=JSON.stringify({defaultCode:fallback.code,languages}).replace(/</g,"\\u003c");
  const boot='<script id="storefront-languages" type="application/json">'+data+'</script>'
    +'<script>(function(){try{var d=JSON.parse(document.getElementById("storefront-languages").textContent),s=localStorage.getItem("storefront-language"),on=d.languages.filter(function(x){return x.enabled}),l=on.find(function(x){return x.code===s})||on.find(function(x){return x.code===d.defaultCode});if(l&&location.pathname.indexOf("/admin")!==0){var p=l.code.toLowerCase().split("-");document.documentElement.lang=p[1]?p[0]+"-"+p[1].toUpperCase():p[0];document.documentElement.dir=l.dir}}catch(e){}})()</script>';
  const withHtml=setHtmlLanguage(html,languageTag(fallback.code),fallback.dir);
  return /<head\b[^>]*>/i.test(withHtml)?withHtml.replace(/<head\b[^>]*>/i,match=>match+boot):withHtml;
}

export function manifestLanguage(languages:StoreLanguage[]){
  const fallback=defaultLanguage(languages);
  return {lang:languageTag(fallback.code),dir:fallback.dir};
}

/**
 * Merges submitted per-language translations into the current ones.
 * Only configured, non-source languages are accepted; languages not submitted are kept as they are.
 */
export function mergeTranslations(current:unknown,input:unknown,codes:string[],keys:readonly string[],limit:number){
  const base=(current&&typeof current==="object"?{...(current as Record<string,unknown>)}:{}) as Record<string,Record<string,string>>;
  if(!input||typeof input!=="object")return base;
  for(const code of codes){
    const fields=(input as Record<string,unknown>)[code];
    if(!fields||typeof fields!=="object")continue;
    base[code]=Object.fromEntries(keys.map(key=>[key,String((fields as Record<string,unknown>)[key]??"").slice(0,limit)]));
  }
  return base;
}

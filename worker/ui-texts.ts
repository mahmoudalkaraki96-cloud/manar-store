import {validateUiTextUpdate,type StoreTexts} from "../shared/ui-messages";

type Statement={bind(...values:unknown[]):Statement;all<T=Record<string,unknown>>():Promise<{results:T[]}>;run():Promise<unknown>};
type Database={prepare(query:string):Statement;batch(statements:Statement[]):Promise<unknown>};

const SCHEMA="CREATE TABLE IF NOT EXISTS ui_texts (text_key TEXT NOT NULL, language TEXT NOT NULL, value TEXT NOT NULL, updated_at INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (text_key, language))";

/** The store's own interface texts, optionally limited to some languages. */
export async function loadUiTexts(db:Database,languages?:string[]):Promise<StoreTexts>{
  let rows:Array<{text_key:string;language:string;value:string}>=[];
  try{rows=(await db.prepare("SELECT text_key,language,value FROM ui_texts").all<{text_key:string;language:string;value:string}>()).results}
  catch{await db.prepare(SCHEMA).run()}
  const wanted=languages?new Set(languages):null,texts:StoreTexts={};
  for(const row of rows){
    if(wanted&&!wanted.has(row.language))continue;
    (texts[row.language]??={})[row.text_key]=row.value;
  }
  return texts;
}

/** Applies an owner update in one batch. Empty text removes the store's version so the default shows again. */
export async function saveUiTexts(db:Database,input:unknown,languages:string[],now=Date.now()){
  const changes=validateUiTextUpdate(input,languages);
  await loadUiTexts(db);
  if(changes.length)await db.batch(changes.map(change=>change.value
    ?db.prepare("INSERT INTO ui_texts(text_key,language,value,updated_at) VALUES (?,?,?,?) ON CONFLICT(text_key,language) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(change.key,change.language,change.value,now)
    :db.prepare("DELETE FROM ui_texts WHERE text_key=? AND language=?").bind(change.key,change.language)));
  return changes.length;
}

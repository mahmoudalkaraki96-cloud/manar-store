import {DatabaseSync} from 'node:sqlite';
import {splitSql} from './platform-cloudflare.mjs';
class ReleaseFailure extends Error{constructor(code){super(code);this.code=code}}
export function schemaChanges(db,baseline){const memory=new DatabaseSync(':memory:');for(const sql of splitSql(baseline).filter(s=>/^CREATE TABLE/i.test(s)))memory.exec(sql);const changes=[];for(const table of memory.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()){const exists=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table.name);if(!exists){changes.push(table.sql);continue}const oldColumns=db.prepare('PRAGMA table_info("'+table.name+'")').all(),old=new Set(oldColumns.map(c=>c.name));
 // The live customer-shipping runtime uses code/label; the original Drizzle baseline used id/name.
 // Accept only the known complete schema. Never add an unrelated id or replace zone rows.
 if(table.name==='shipping_zones'&&old.has('code')){
  if(!oldColumns.some(c=>c.name==='code'&&c.pk===1)||!['label','price_agorot','active','sort_order','updated_at'].every(name=>old.has(name)))throw new ReleaseFailure('shipping_schema_requires_review');
  continue;
 }
for(const column of memory.prepare('PRAGMA table_info("'+table.name+'")').all())if(!old.has(column.name)){if(column.pk){console.error('schema_review:'+table.name+':'+column.name);throw new ReleaseFailure('schema_key_requires_review_'+table.name+'_'+column.name)}let tail=column.type||'TEXT';if(column.notnull)tail+=' NOT NULL';if(column.dflt_value!=null)tail+=' DEFAULT '+column.dflt_value;else if(column.notnull)tail+=' DEFAULT '+(/INT|REAL|NUM|FLOAT|DOUBLE/i.test(column.type)?'0':"''");changes.push('ALTER TABLE "'+table.name+'" ADD COLUMN "'+column.name+'" '+tail)}}memory.close();return changes}

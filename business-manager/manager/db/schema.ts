import {sqliteTable,text,integer,index} from "drizzle-orm/sqlite-core";
export const records=sqliteTable("records",{id:text("id").primaryKey(),business:text("business").notNull(),kind:text("kind").notNull(),payload:text("payload").notNull(),created:integer("created").notNull()},t=>[index("idx_records_business_kind").on(t.business,t.kind)]);
export const aiControl=sqliteTable('ai_control',{id:integer('id').primaryKey(),enabled:integer('enabled').notNull()});
export const aiUsage=sqliteTable('ai_usage',{id:text('id').primaryKey(),month:text('month').notNull(),cost:integer('cost').notNull(),status:text('status').notNull(),created:integer('created').notNull()},t=>[index('idx_ai_usage_month').on(t.month)]);

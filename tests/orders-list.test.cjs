const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
test('1.9.9: orders list has status tabs with counts, city and period filters, table and pager',()=>{
 const panel=read('app/admin/OrdersPanel.tsx');
 assert.match(panel,/className="orderStatusTabs" role="tablist"/);
 assert.match(panel,/statusTabs:\[string,string\]\[\]=\[\["all","الكل"\],\.\.\.Object\.entries\(labels\)\]/);
 assert.match(panel,/<i>\{statusCounts\[key\]\|\|0\}<\/i>/,'each tab shows its count');
 assert.match(panel,/<span>المدينة<\/span><select value=\{cityFilter\}/);
 assert.match(panel,/<span>الفترة<\/span><select value=\{period\}/);
 assert.match(panel,/<table className="ordersTable">/);
 assert.match(panel,/const pageSize=25/);
 assert.match(panel,/className="orderRowMenuCell"/,'row menu keeps quick status and WhatsApp');
 assert.match(panel,/quickStatus\(order,event\.target\.value\)/);
 assert.match(panel,/<OrderWhatsAppLinks phone=\{order\.phone\}\/>/);
 assert.doesNotMatch(panel,/className="orderSummaryList"/,'old card list removed');
 assert.match(read('app/admin/Dashboard.tsx'),/onNavigate\('الطلبات','working'\)/,'dashboard opens confirmed + preparing');
 assert.match(panel,/statusFilter==="working"&&\["confirmed","preparing"\]/);
});
test('1.9.9: CSV export escapes quotes and neutralises spreadsheet formulas',()=>{
 const panel=read('app/admin/OrdersPanel.tsx');
 const src=panel.match(/const cell=(\(value:unknown\)=>\{.*?\});const rows=/)[1].replace('value:unknown','value');
 const cell=eval(src);
 assert.equal(cell('a"b'),'"a""b"');
 assert.equal(cell('=HYPERLINK(1)'),`"'=HYPERLINK(1)"`);
 assert.equal(cell(12),'"12"');
 assert.ok(panel.includes('["'+'\\'+'ufeff"+rows'),'BOM so Excel reads Arabic');
});
test('1.9.9: orders table turns into cards on phones',()=>{
 const css=read('app/admin/admin.css');
 const block=css.slice(css.indexOf('/* 1.9.9: orders list'));
 assert.match(block,/@media\(max-width:800px\)\{[\s\S]*\.ordersTable thead\{display:none\}/);
 assert.match(block,/\.ordersTable tbody tr\{display:grid/);
});

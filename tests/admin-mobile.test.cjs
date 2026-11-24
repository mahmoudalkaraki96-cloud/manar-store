const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const orders=fs.readFileSync("app/admin/OrdersPanel.tsx","utf8"),css=fs.readFileSync("app/admin/admin-responsive.css","utf8");

test("order details: close is the first action (it gets the close styling), delete is last and confirmed",()=>{
 const start=orders.indexOf('className="orderDetailActions noPrint"><button type="button" className="orderDetailClose" aria-label="إغلاق تفاصيل الطلب"');
 assert.ok(start>=0,"close button must be the first button in the order details bar");
 const bar=orders.slice(start);
 const end=bar.indexOf("</div>"),actions=bar.slice(0,end);
 assert.match(actions,/aria-label="إغلاق تفاصيل الطلب"/);
 assert.ok(actions.lastIndexOf("orderDeleteAction")>actions.lastIndexOf("حفظ التجهيز PDF"),"delete comes after the other actions");
 assert.match(actions,/window\.confirm\("نقل الطلب إلى المحذوفات؟/);
});

test("buttons that used to render as plain text have a button style",()=>{
 for(const selector of [".secondaryAction",".categoryAdmin button:not([class])",".sliderSelectedProduct>button",".orderDetailControls,.orderExtraFees)>button:not([class])",".adminTranslationFields>[role=group]>button[aria-pressed=true]",".customerTabs>button[aria-selected=true]"])
  assert.ok(css.includes(selector),selector);
 for(const file of ["app/admin/DiscountsPanel.tsx","app/admin/OrdersPanel.tsx"])assert.match(fs.readFileSync(file,"utf8"),/className="secondaryAction"/);
});

test("dashboard headers are not the storefront's fixed sticky site header",()=>{
 assert.match(css,/\.adminRedesign header:not\(\.adminTop\)\{height:auto;position:static/);
});

test("phone layout: panels cannot grow wider than the screen and the inventory list is paged",()=>{
 assert.match(css,/\.adminRedesign \.dataPanel\{grid-template-columns:minmax\(0,1fr\)/);
 const ops=fs.readFileSync("app/admin/OperationsPanel.tsx","utf8");
 assert.match(ops,/const INVENTORY_PAGE=60;/);
 assert.match(ops,/products\.slice\(0,inventoryLimit\)/);
});

test("overview period pills are today, 7 days and 30 days like the sample",()=>{
 assert.ok(fs.readFileSync("app/admin/Dashboard.tsx","utf8").includes('[1,7,30].map(v=><button key={v} type="button" aria-pressed={days===v}'));
});

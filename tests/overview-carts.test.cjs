const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
test('1.9.10: overview follows the sample order and wording',()=>{
 const d=read('app/admin/Dashboard.tsx');
 const view=d.slice(d.indexOf('export function DashboardView'),d.indexOf('const greeting='));
 const order=['بدها انتباهك هلّأ','className="statGrid"','آخر الطلبات','الأكثر مبيعاً','التطبيق والإشعارات','className="overviewMore"'];
 const at=order.map(x=>view.indexOf(x));
 assert.ok(at.every(i=>i>=0),'all sections present');
 assert.deepEqual([...at].sort((a,b)=>a-b),at,'sections in sample order');
 for(const label of ['طلبات جديدة بدها تأكيد','طلبات قيد التجهيز','منتجات خلصت من المخزون','منتجات قرّبت تخلص'])assert.ok(view.includes(label),label);
 for(const target of ["'الطلبات','new'","'الطلبات','working'","'المنتجات','soldout'","'المنتجات','low'"])assert.ok(view.includes(target),target);
 assert.match(d,/عن الفترة اللي قبل/);
 assert.match(view,/o\.customerName\?' · '\+o\.customerName/);
 assert.ok(view.includes('<AdminThumb src={p.image}/>'));
 const more=view.slice(view.indexOf('className="overviewMore"'));
 for(const kept of ['حالات الطلبات','المتجر بالأرقام','<LiveActivityPanel/>','{extra}'])assert.ok(more.includes(kept),kept+' kept under تفاصيل أكثر');
 assert.match(d,/هاي أهم إشي بمتجرك/);
 assert.match(read('app/admin/page.tsx'),/<Dashboard onNavigate=\{navigate\} extra=\{<section className="dashboardPanel dashboardCarts"><CartMetricsPanel onOpenProduct=/);
});
test('1.9.10: orders rows change status directly again',()=>{
 const p=read('app/admin/OrdersPanel.tsx');
 const cell=p.slice(p.indexOf('className="orderStatusCell"'),p.indexOf('className="orderRowMenuCell"'));
 assert.match(cell,/<select id=\{"quick-status-"\+order\.id\} className=\{"orderStatusSelect /);
 assert.match(cell,/quickStatus\(order,event\.target\.value\)/);
 assert.doesNotMatch(p.slice(p.indexOf('className="orderRowMenu"')),/^[^]*?orderQuickStatus[^]*?orderRowContact/,'menu no longer duplicates the status');
});
test('1.9.10: dashboard and cart APIs return names, piece counts, images and unit prices',()=>{
 const dash=read('worker/admin-dashboard.ts'),carts=read('worker/grouped-carts.ts');
 assert.match(dash,/o\.customer_name,\(SELECT COALESCE\(SUM\(oi\.quantity\),0\) FROM order_items oi WHERE oi\.order_id=o\.id\) AS item_count/);
 assert.match(dash,/FROM product_media pm WHERE pm\.product_id=t\.product_id AND pm\.media_type='image'/);
 assert.match(carts,/unitPrice:unitAgorot==null\?null:unitAgorot\/100,image:variant\?\.image_url\|\|product\?\.image_url\|\|null/);
});
test('1.9.10: a cart opens in a dialog with images, prices and total',()=>{
 const c=read('app/admin/CartMetricsPanel.tsx');
 assert.match(c,/className="browserCart browserCartButton"[^>]*aria-haspopup="dialog" onClick=\{\(\)=>setOpenKey\(cart\.deviceKey\)\}/);
 assert.match(c,/role="dialog" aria-modal="true"/);
 assert.ok(c.includes('<AdminThumb src={item.image}/>'));
 assert.match(c,/\{n\(item\.quantity\)\} × \{price\(item\.unitPrice\)\}/);
 assert.match(c,/event\.key==='Escape'/);
 assert.match(c,/مجموع السلة/);
 assert.match(read('app/admin/admin.css'),/@media\(max-width:800px\)\{\.cartDialogBackdrop\{align-items:flex-end/);
});
test('1.9.11: admin thumbnails load eagerly and fall back to the original image',()=>{
 const t=read('app/admin/AdminThumb.tsx');
 assert.ok(!t.includes('loading="lazy"'),'no lazy loading inside scrolling popups');
 assert.ok(t.includes('onError={()=>{if(src&&current!==src)setCurrent(src);else setFailed(true)}}'));
 assert.ok(t.includes('className={"adminThumbEmpty"'));
 for(const f of ['app/admin/CartMetricsPanel.tsx','app/admin/Dashboard.tsx'])assert.ok(!read(f).includes('loading="lazy"'),f);
});

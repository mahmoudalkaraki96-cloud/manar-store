const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const block=()=>{const s=read('app/admin/page.tsx'),a=s.indexOf('{tab==="المنتجات"&&');return s.slice(a,s.indexOf('{tab==="الأقسام"&&',a));};
test('1.9.12: products page has sample header, summary chips and compact toolbar',()=>{
 const b=block();
 assert.ok(b.includes('<p>أضف، عدّل وتابع المخزون لكل منتج.</p>'));
 assert.ok(b.includes('onClick={()=>navigate("استيراد الأصناف")}'));
 for(const chip of ['"all","كل المنتجات"','"active","ظاهرة بالمتجر"','"draft","مسودات"','"soldout","خلصت"','"low","قرّبت تخلص"'])assert.ok(b.includes(chip),chip);
 assert.ok(b.includes('<option value="sold">الأكثر مبيعاً</option>'));
 assert.ok(b.includes('aria-controls="products-more-filters"'));
 const more=b.slice(b.indexOf('id="products-more-filters"'));
 for(const kept of ['فلتر المورد','فلتر المتغيرات','فلتر الصور','فلتر التمييز','السعر من','المخزون من','أقل مشاهدات','مسح الفلاتر'])assert.ok(more.includes(kept),kept+' kept under فلاتر أكثر');
 assert.ok(!b.includes('تمرير داخل الجدول'),'scroll mode removed');
});
test('1.9.12: table columns, stock states, visible switch and row menu',()=>{
 const b=block(),s=read('app/admin/page.tsx');
 assert.ok(b.includes('<th>المنتج</th><th>رقم الصنف</th><th>القسم</th><th>السعر</th><th>المخزون</th><th>المبيع</th><th>ظاهر</th>'));
 assert.ok(b.includes('role="switch" aria-checked={product.active}'));
 assert.ok(b.includes('onClick={()=>void toggleActive(product)}'));
 for(const action of ['تعديل','إلغاء التمييز','حذف'])assert.ok(b.slice(b.indexOf('className="productRowMenu"')).includes(action),action);
 assert.ok(b.includes('<SearchableCategory categories={data.categories} value={product.categoryId}'),'quick category change kept');
 assert.ok(s.includes('{tone:"out",text:"خلص"}')&&s.includes('{tone:"low",text:"باقي "+stock}')&&s.includes('{tone:"ok",text:stock+" قطعة"}'));
 assert.ok(s.includes('`/api/admin/products/${product.id}/active`'));
 assert.ok(b.includes('className="productsGrid"')&&b.includes('<AdminThumb src={product.image} width={384}/>'),'grid view');
 assert.ok(s.includes('localStorage.setItem("admin-products-layout",layout)'));
});
test('1.9.12: active route updates only live products and sold sort uses order count',()=>{
 const w=read('worker/index.ts');
 assert.ok(w.includes('"UPDATE products SET active=?,updated_at=? WHERE id=? AND deleted_at IS NULL"'));
 assert.ok(w.includes('return json({error:"المنتج غير موجود"},{status:404})'));
 assert.ok(read('app/admin/product-filters.ts').includes("f.sort==='sold'?(b.orders||0)-(a.orders||0)"));
});
test('1.9.12: products table becomes cards on phones',()=>{
 const css=read('app/admin/admin.css'),b=css.slice(css.indexOf('/* 1.9.12: products page'));
 assert.ok(b.includes('.adminRedesign .productsTable thead{display:none}'));
 assert.ok(b.includes('.adminRedesign .productsGrid{grid-template-columns:repeat(2,minmax(0,1fr))'));
});

const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const editor=()=>{const s=read('app/admin/page.tsx'),a=s.indexOf('{editingProduct&&<div className="editModal productEditorPage">');assert.ok(a>0,'editor found');return s.slice(a,s.indexOf('</div></div>}',s.indexOf('productEditorMobileSave',a))+13);};
test('1.9.14: editor top bar has breadcrumb, unsaved note, store preview and save',()=>{
 const e=editor();
 assert.ok(e.includes('onClick={closeProductEditor}>المنتجات</button> › {editingProduct.id?"تعديل":"منتج جديد"}'));
 assert.ok(e.includes('{productDirty&&<span className="unsavedNote" role="status">● في تغييرات مش محفوظة</span>}'));
 assert.ok(e.includes('"/product/"+editingProduct.id'));
 assert.ok(e.includes('"حفظ التغييرات"'));
 const s=read('app/admin/page.tsx');
 assert.ok(s.includes('window.confirm("في تغييرات مش محفوظة. بدك تسكّر بدون حفظ؟")'));
 assert.ok(s.includes('window.addEventListener("beforeunload",warn)'));
});
test('1.9.14: main column sections in sample order and side column cards',()=>{
 const e=editor(),main=e.slice(e.indexOf('productEditorMain'),e.indexOf('productEditorSide'));
 const order=['المعلومات الأساسية','<h3>الصور</h3>','<h3>السعر</h3>','<h3>المتغيرات</h3>','إعدادات إضافية'].map(x=>main.indexOf(x));
 assert.ok(order.every(i=>i>=0),'all main sections');
 assert.deepEqual([...order].sort((a,b)=>a-b),order);
 const side=e.slice(e.indexOf('productEditorSide'));
 for(const card of ['<h3>الحالة</h3>','<h3>القسم</h3>','<h3>المخزون</h3>','<h3>كيف بيطلع بجوجل</h3>'])assert.ok(side.includes(card),card);
 assert.ok(side.includes('role="switch" aria-checked={editingProduct.active}'));
 assert.ok(side.includes('role="switch" aria-checked={editingProduct.featured}'));
});
test('1.9.14: nothing from the old editor is lost',()=>{
 const e=editor();
 for(const kept of ['addMedia(event.target.files,"image")','onPaste={pasteImages}','importImageUrl()','addMedia(event.target.files,"video")','addVariant','addVariantMedia(index','pasteVariantImages(index','importVariantImageUrl(index)','addCustomField','updateCustomField(index','الكلمات المفتاحية','مصدر الاستيراد','SearchableCategory','value={editingProduct.itemNumber||""}','value={editingProduct.wholesale??""}','value={editingProduct.purchasePrice??""}','value={editingProduct.stock}','value={editingProduct.specifications||""}'])assert.ok(e.includes(kept),kept);
});
test('1.9.14: old price, profit, language tabs, main image and drop upload',()=>{
 const e=editor(),s=read('app/admin/page.tsx');
 assert.ok(e.includes('value={editingProduct.oldPrice??""}'));
 assert.ok(e.includes('الربح: {productProfit.amount} ₪ لكل قطعة ({productProfit.percent}%)'));
 assert.ok(s.includes('percent:Math.round((editingProduct.price-editingProduct.purchasePrice)/editingProduct.price*100)'));
 assert.ok(e.includes('role="group" aria-label="لغة النص"'));
 assert.ok(e.includes('<span className="mainImageBadge">الرئيسية</span>'));
 assert.ok(e.includes('onDrop={event=>{event.preventDefault();setMediaDragOver(false);void addMedia('));
 assert.ok(e.includes('className="variantSummary"'));
});
test('1.9.14: editor stacks to one column with a sticky save on phones',()=>{
 const css=read('app/admin/admin.css'),b=css.slice(css.indexOf('/* 1.9.14: product editor'));
 assert.ok(b.includes('.adminRedesign .productEditorMobileSave{display:block;position:sticky;bottom:0'));
 assert.ok(b.includes('.adminRedesign .productEditorSide{position:static}'));
});
test('1.9.15: editor top bar beats the generic static header rule',()=>{
 // admin-responsive.css loads after admin.css and sets .adminRedesign header:not(.adminTop){position:static} (0,2,1),
 // so the sticky bar needs a stronger selector (0,3,1), not just a later one.
 assert.ok(read('app/admin/admin-responsive.css').includes('.adminRedesign header:not(.adminTop){height:auto;position:static'));
 assert.ok(read('app/admin/admin.css').includes('.adminRedesign .productEditorV2 header.productEditorBar{position:sticky;top:0'));
});

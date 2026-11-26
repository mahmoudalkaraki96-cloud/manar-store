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
test('1.9.16: main column opens with the quick basics card, side keeps the summaries',()=>{
 const e=editor(),main=e.slice(e.indexOf('productEditorMain'),e.indexOf('productEditorSide'));
 const order=['<h3>الأساسيات</h3>','الوصف والمواصفات','<h3>الصور</h3>','<h3>المتغيرات</h3>','إعدادات إضافية'].map(x=>main.indexOf(x));
 assert.ok(order.every(i=>i>=0),'all main sections');
 assert.deepEqual([...order].sort((a,b)=>a-b),order);
 const quick=main.slice(main.indexOf('quickBasics'),main.indexOf('الوصف والمواصفات'));
 for(const field of ['اسم المنتج','رقم الصنف','<span>القسم</span><SearchableCategory','السعر (₪)','السعر قبل الخصم','المخزون','سعر الجملة','التكلفة','الربح','aria-checked={editingProduct.active}'])assert.ok(quick.includes(field),field+' in quick card');
 assert.ok(!main.includes('<h3>السعر</h3>'),'separate price card removed');
 const side=e.slice(e.indexOf('productEditorSide'));
 for(const card of ['<h3>الحالة</h3>','<h3>المخزون</h3>','<h3>كيف بيطلع بجوجل</h3>'])assert.ok(side.includes(card),card);
 assert.ok(!side.includes('<h3>القسم</h3>')&&!side.includes('aria-checked={editingProduct.active}'),'category and visibility moved to the quick card');
 assert.ok(side.includes('aria-checked={editingProduct.featured}'));
 assert.equal((e.match(/SearchableCategory categories={data.categories} value={editingProduct.categoryId}/g)||[]).length,1,'one category picker');
});
test('1.9.16: fast entry — autofocus, Ctrl+S, save and add another in the same category',()=>{
 const s=read('app/admin/page.tsx'),e=editor();
 assert.ok(e.includes('ref={productNameRef} autoFocus={!editingProduct.id}'));
 assert.ok(s.includes('(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="s"'));
 assert.ok(e.includes('onClick={()=>void saveProduct(true)}')&&e.includes('حفظ وإضافة منتج تاني'));
 assert.ok(s.includes('if(another)setEditingProduct({...emptyProduct,images:[],variants:[],categoryId:keepCategory})'));
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
test('1.9.16: quick card fields sit side by side, two per row on phones',()=>{
 const css=read('app/admin/admin.css'),b=css.slice(css.indexOf('/* 1.9.16: quick basics'));
 assert.ok(b.includes('.adminRedesign .quickRow2{grid-template-columns:minmax(0,1.6fr) repeat(3,minmax(0,1fr))}'));
 assert.ok(b.includes('@media(max-width:1100px){.adminRedesign .quickRow2{grid-template-columns:repeat(2,minmax(0,1fr))}'));
});
test('1.9.17: product editor is above the sticky account bar',()=>{
 const css=read('app/admin/admin.css');
 assert.ok(css.includes('.adminRedesign .editModal.productEditorPage{z-index:360}'));
 const bars=[...(css+read('app/admin/admin-responsive.css')).matchAll(/\.adminAccountBar\{[^}]*z-index:(\d+)/g)].map(m=>Number(m[1]));
 assert.ok(bars.length&&bars.every(z=>z<360),'account bar stays below the editor: '+bars);
});

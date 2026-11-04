const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),file=path.join(root,'worker/seo-content.ts');
const m=new Module(file,module);m.filename=file;m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,file);
const seo=m.exports;

test('robots lets crawlers read only the public storefront endpoints under /api/',()=>{
 const body=seo.robotsTxt('https://store.test');
 for(const line of ['Allow: /api/catalog','Allow: /api/storefront','Allow: /api/seo','Disallow: /api/','Disallow: /account','Sitemap: https://store.test/sitemap.xml'])assert.ok(body.split('\n').includes(line),line);
 assert.doesNotMatch(body,/Allow: \/api\/admin/);
});

test('sitemap lists escaped product images under the image namespace',()=>{
 const xml=seo.sitemapXml([{loc:'https://store.test/'},{loc:'https://store.test/product/1',lastmod:1000,images:['https://store.test/media/a.webp?x=1&y=2']}]);
 assert.match(xml,/xmlns:image="http:\/\/www\.google\.com\/schemas\/sitemap-image\/1\.1"/);
 assert.match(xml,/<image:image><image:loc>https:\/\/store\.test\/media\/a\.webp\?x=1&amp;y=2<\/image:loc><\/image:image>/);
 assert.equal((xml.match(/<image:image>/g)||[]).length,1);
});

test('product content exposes name, price and described images, and escapes product text',()=>{
 const html=seo.productSeoContent({name:'شمعة <b>"PVC"</b>',description:'وصف & تفاصيل',priceAgorot:1250,images:[{url:'/media/a.webp',alt:''},{url:'/media/b.webp',alt:'صورة جانبية'}],category:{name:'الشموع',slug:'الشموع'}});
 assert.match(html,/id="storefront-seo-content"/);
 assert.match(html,/12\.50 ₪/);
 assert.match(html,/href="\/category\/%D8%A7/);
 assert.match(html,/alt="صورة جانبية"/);
 assert.equal((html.match(/<img /g)||[]).length,2);
 assert.equal((html.match(/loading="lazy"/g)||[]).length,2);
 assert.doesNotMatch(html,/<b>"PVC"/);
 assert.match(html,/&lt;b&gt;&quot;PVC&quot;/);
 assert.match(html,/وصف &amp; تفاصيل/);
});

test('category content links its products and subcategories, skipping missing images',()=>{
 const html=seo.categorySeoContent({name:'القسم',description:'',subcategories:[{name:'فرعي',slug:'sub'}],products:[{id:5,name:'أ',priceAgorot:500,image:'/media/a.webp'},{id:6,name:'ب',priceAgorot:600}]});
 assert.match(html,/href="\/category\/sub"/);
 assert.match(html,/href="\/product\/5"/);
 assert.match(html,/href="\/product\/6"/);
 assert.equal((html.match(/<img /g)||[]).length,1);
});

test('content goes before the last body close and keeps special replacement characters',()=>{
 const page='<body><script>"</body>"</script></body></html>';
 assert.equal(seo.insertSeoContent(page,'<p>$& 5</p>'),'<body><script>"</body>"</script><p>$& 5</p></body></html>');
 assert.equal(seo.insertSeoContent(page,''),page);
 assert.equal(seo.insertSeoContent('<p>no body</p>','x'),'<p>no body</p>');
});

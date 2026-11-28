const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
test('1.10.2: thumbnails fall back to the worker codecs, then to the original image',()=>{
 const w=read('worker/index.ts'),route=w.slice(w.indexOf('url.pathname==="/_media/thumbnail"'),w.indexOf('url.pathname === "/_vinext/image"'));
 assert.ok(route.indexOf('env.IMAGES.input(new Response(sourceBytes).body!)')>0,'Images first, from a buffered copy');
 assert.ok(route.indexOf('makeThumbnail(sourceBytes,width,thumb.quality)')>route.indexOf('env.IMAGES.input'),'WASM after Images');
 assert.ok(route.includes('await import("./thumb-maker")'),'codecs load lazily');
 assert.ok(!/^import .*thumb-maker/m.test(w)&&!/^import .*thumb-maker/m.test(read('worker/thumbnail-backfill.ts')),'no static import of the wasm codecs');
 assert.match(route,/thumb\.mime==="image\/avif"\)\{const webp=new URL\(url\);webp\.searchParams\.delete\("format"\)/);
 assert.match(route,/if\(!bytes\)return new Response\(sourceBytes,\{headers:\{"content-type":originalType/);
 const m=read('worker/thumb-maker.ts');
 for(const wasm of ['webp_dec.wasm?module','webp_enc_simd.wasm?module','mozjpeg_dec.wasm?module','squoosh_png_bg.wasm?module','squoosh_resize_bg.wasm?module'])assert.ok(m.includes(wasm),wasm);
 assert.match(m,/if\(typeof scope\.ImageData==="undefined"\)scope\.ImageData=WorkerImageData/);
});
test('1.10.2: scheduled backfill uses the route key layout and a lease',()=>{
 const b=read('worker/thumbnail-backfill.ts');
 assert.match(b,/export const BACKFILL_WIDTHS=\[256,384,640\]/);
 assert.ok(b.includes('`thumbnails/w${width}/${sourceKey.replace(/\\.[^.]+$/,"")}.webp`'));
 assert.match(b,/lease_until<\?/);
 assert.ok(read('worker/index.ts').includes('ctx.waitUntil(backfillThumbnails(env)'));
});
test('1.10.2: carts show the original image when a thumbnail fails',()=>{
 const o=read('app/components/ShoppingOverlay.tsx'),bar=read('app/components/StickyCartBar.tsx');
 assert.ok(o.includes('src={productThumbnail(line.image,240)} alt="" decoding="async" onError='));
 assert.ok(bar.includes('src={productThumbnail(line.image,240)}'));
 assert.ok(bar.includes('img.src=line.image'));
});
test('1.10.2: orders and admin carts group items by supplier with profit',()=>{
 const s=read('worker/sourcing.ts');
 assert.match(s,/agorot\(variant\?\.purchase_price_agorot\)\?\?agorot\(product\?\.purchase_price_agorot\)\?\?agorot\(supplier\?\.supplier_price_agorot\)/);
 assert.match(s,/ORDER BY ps\.preferred DESC,ps\.id/);
 assert.match(s,/\/\^https:\\\/\\\/\/\.test/,'only https supplier links');
 assert.ok(read('worker/admin-security.ts').includes("path==='/api/admin/sourcing')return ['suppliers.write','products.write']"));
 assert.ok(read('worker/index.ts').includes('url.pathname==="/api/admin/sourcing"'));
 const orders=read('app/admin/OrdersPanel.tsx');
 assert.ok(orders.includes('رتّب حسب المورد والربح'));
 assert.match(orders,/<SourcingView lines=\{selected\.items\.map\(/);
 assert.ok(orders.includes('discount={selected.discount}'));
 const cart=read('app/admin/CartMetricsPanel.tsx');
 assert.match(cart,/canSource=can\('suppliers\.write'\)\|\|can\('products\.write'\)/);
 assert.ok(cart.includes('<SourcingView title="أصناف السلة حسب المورد"'));
 const view=read('app/admin/SourcingView.tsx');
 for(const label of ['الربح بعد الخصم','نسخ قائمة الطلب','افتح عند المورد ↗','ما إله سعر تكلفة'])assert.ok(view.includes(label),label);
});

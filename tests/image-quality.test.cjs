const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),ts=require("typescript");
const load=(file,deps={})=>{const m={exports:{}};new Function("module","exports","require",ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(m,m.exports,name=>name in deps?deps[name]:require(name));return m.exports};
const sizes=load("shared/image-sizes.ts"),utils=load("app/image-utils.ts",{"../shared/image-sizes":sizes});

test("1.10.3: every small image shares the 384 copy; card quality is unchanged",()=>{
 for(const [requested,produced] of [[180,384],[240,384],[320,384],[384,384],[480,384],[640,640]])assert.equal(sizes.thumbnailWidth(requested),produced,String(requested));
 assert.deepEqual(sizes.PREMADE_WIDTHS,[384,1080]);
 for(const width of [256,384,640])assert.deepEqual(sizes.thumbnailFormat(width,"avif"),{mime:"image/webp",extension:"webp",suffix:"",quality:75});
});

test("product page images are larger and higher quality, with AVIF on request",()=>{
 assert.equal(sizes.thumbnailWidth(768),1080);
 assert.equal(sizes.thumbnailWidth(1080),1080);
 assert.equal(sizes.thumbnailWidth(1600),1280);
 assert.deepEqual(sizes.thumbnailFormat(1080,null),{mime:"image/webp",extension:"webp",suffix:"-q82",quality:82});
 assert.deepEqual(sizes.thumbnailFormat(1280,"avif"),{mime:"image/avif",extension:"avif",suffix:"-avif",quality:60});
 const s=utils.productImageSources("/media/products/a.webp");
 assert.match(s.src,/width=1080$/);
 assert.match(s.webp,/width=640 640w, .*width=1080 1080w, .*width=1280 1280w$/);
 assert.match(s.avif,/width=640 640w/);
 assert.doesNotMatch(s.avif.split(", ")[0],/format=avif/);
 assert.match(s.avif,/width=1080&format=avif 1080w/);
 assert.equal(utils.productImageSources("https://cdn.example/x.jpg"),null);
 assert.equal(utils.productThumbnail("/media/a.svg",1080),"/media/a.svg");
});

test("uploads keep a 2048px master at quality 90, and the server accepts exactly the published widths",()=>{
 assert.equal(sizes.UPLOAD_MAX_SIZE,2048);assert.equal(sizes.UPLOAD_QUALITY,0.9);
 const worker=fs.readFileSync("worker/index.ts","utf8");
 assert.match(worker,/if\(!THUMBNAIL_WIDTHS\.includes\(width\)\)return new Response\("Invalid image width"/);
 assert.match(fs.readFileSync("app/admin/page.tsx","utf8"),/options\?\.maxSize\|\|UPLOAD_MAX_SIZE/);
 assert.match(fs.readFileSync("worker/normalize-upload.ts","utf8"),/bound\(options\.maxSize,UPLOAD_MAX_SIZE/);
});

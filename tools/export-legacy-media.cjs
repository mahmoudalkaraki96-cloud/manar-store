// Explicit offline export of historical store assets, never imported by the Worker.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const previous=require.extensions['.ts'];
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
try{
 const {importedMediaSources}=require('./legacy-media-source-data.ts');
 const {product2222ImageBase64}=require('../worker/product-2222-image.generated.ts');
 const out=path.join(__dirname,'../outputs/legacy-media');fs.mkdirSync(out,{recursive:true});
 fs.writeFileSync(path.join(out,'media-sources.json'),JSON.stringify([...importedMediaSources]));
 fs.writeFileSync(path.join(out,'product-2222-edited.webp'),Buffer.from(product2222ImageBase64,'base64'));
 console.log(JSON.stringify({manifestEntries:importedMediaSources.size,output:out}));
}finally{if(previous)require.extensions['.ts']=previous;else delete require.extensions['.ts']}

const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};}
function harness(file,override){
 const source=override||fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let fn;
 function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='refresh'&&node.initializer&&ts.isArrowFunction(node.initializer))fn=node.initializer;ts.forEachChild(node,visit)}visit(ast);assert.ok(fn,'actual component refresh function');
 const compiled=ts.transpileModule('const refresh='+fn.getText(ast)+'; export {refresh};',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const requests=[],loadingTransitions=[],state={loading:true,data:{products:[{id:1,name:'old'}]},orders:[{id:1,status:'new'}],message:''},module={exports:{}};
 new Function('module','exports','fetch','setLoading','setData','setOrders','setMessage','catalogRequest','ordersRequest',compiled)(module,module.exports,()=>{const d=deferred();requests.push(d);return d.promise},value=>{state.loading=value;loadingTransitions.push(value)},value=>state.data=value,value=>state.orders=value,value=>state.message=value,{current:0},{current:0});
 return {refresh:module.exports.refresh,state,requests,loadingTransitions};
}
const cases=[['products','app/admin/page.tsx','data',{products:[{id:1,name:'updated'}]}],['orders','app/admin/OrdersPanel.tsx','orders',[{id:1,status:'confirmed'}]]];
function reply(label,value){return {ok:true,json:async()=>label==='orders'?{orders:value}:value};}
for(const [label,file,key,next] of cases){
 test(label+': initial fetch loads, subsequent fetch keeps existing content visible',async()=>{
  const h=harness(file);const initial=h.refresh();assert.equal(h.state.loading,true);h.requests[0].resolve(reply(label,next));await initial;assert.equal(h.state.loading,false);assert.deepEqual(h.state[key],next);
  h.loadingTransitions.length=0;const existing=h.state[key],refresh=h.refresh();assert.equal(h.state.loading,false);assert.equal(h.state[key],existing);assert.ok(!h.loadingTransitions.includes(true));h.requests[1].resolve(reply(label,next));await refresh;assert.equal(h.state.loading,false);
 });
 test(label+': failed revalidation retains last data and reports an error',async()=>{
  const h=harness(file);h.state.loading=false;const before=h.state[key],refresh=h.refresh();h.requests[0].reject(Error('offline'));await refresh;assert.equal(h.state.loading,false);assert.equal(h.state[key],before);assert.equal(h.state.message,'offline');assert.ok(!h.loadingTransitions.includes(true));
 });
 test(label+': an older response or error cannot overwrite a newer refresh',async()=>{
  for(const failed of [false,true]){const h=harness(file);h.state.loading=false;const older=h.refresh(),newer=h.refresh();h.requests[1].resolve(reply(label,next));await newer;if(failed)h.requests[0].reject(Error('stale failure'));else h.requests[0].resolve(reply(label,label==='orders'?[]:{products:[]}));await older;assert.deepEqual(h.state[key],next);assert.equal(h.state.message,'')}
 });
 test(label+': visibility regression test rejects the previous implementation',async()=>{
  const source=fs.readFileSync(file,'utf8').replace('const refresh=async()=>{','const refresh=async()=>{setLoading(true);'),h=harness(file,source);h.state.loading=false;const refresh=h.refresh();assert.equal(h.state.loading,true);h.requests[0].resolve(reply(label,next));await refresh;
 });
}


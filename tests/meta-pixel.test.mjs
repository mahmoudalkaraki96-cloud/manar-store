import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {buildMetaPixelHead} from "../worker/meta-pixel.ts";

test("disabled, empty and unsafe pixel IDs do not load tracking",()=>{
 for(const id of ["","123","abc","12345'</script><script>alert(1)</script>","1".repeat(31)])assert.equal(buildMetaPixelHead(id,true),"");
 assert.equal(buildMetaPixelHead("1231904457865622",false),"");
});
test("initialization queues one PageView and uses the chosen pixel without contact data",()=>{
 const html=buildMetaPixelHead("987654321012345",true),script=html.slice(8,-9),inserted=[];
 const context={location:{pathname:"/product/170"},document:{createElement:()=>({}),getElementsByTagName:()=>[{parentNode:{insertBefore:node=>inserted.push(node)}}]}};
 context.window=context;
 vm.runInNewContext(script,context);
 const calls=Array.from(context.window.fbq.queue,args=>Array.from(args));
 assert.equal(calls.filter(call=>call[0]==="init").length,1);
 assert.equal(calls.find(call=>call[0]==="init")[1],"987654321012345");
 assert.equal(calls.filter(call=>call[1]==="PageView").length,1);
 assert.equal(calls.find(call=>call[0]==="init").length,2);
 assert.equal(context.window.__manarPixelPath,"/product/170");
 assert.equal(inserted[0].src,"https://connect.facebook.net/en_US/fbevents.js");
});

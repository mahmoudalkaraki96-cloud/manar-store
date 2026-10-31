const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function fixture(){
 const states=[],refs=[],listeners=new Map();let cursor=0,refCursor=0,effects=[],cleanups=[],chosen;
 const target=name=>({addEventListener(type,fn){listeners.set(name+':'+type,fn)},removeEventListener(type){listeners.delete(name+':'+type)}});
 const viewport={...target('visual'),width:390,height:700,offsetTop:0,offsetLeft:0};
 const win={...target('window'),innerWidth:390,innerHeight:700,visualViewport:viewport};
 const react={useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return[states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value}]},useRef(initial){const i=refCursor++;return refs[i]||(refs[i]={current:initial})},useEffect(effect){effects.push(effect)}};
 const jsx=(type,props)=>({type,props});const module={exports:{}};
 const source=ts.transpileModule(fs.readFileSync('app/admin/SearchableCategory.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(source,{module,exports:module.exports,window:win,document:{...target('document'),body:{}},require(name){if(name==='react')return react;if(name==='react/jsx-runtime')return{jsx,jsxs:jsx,Fragment:'fragment'};if(name==='react-dom')return{createPortal:node=>node};if(name==='../catalog-types')return{norm:s=>String(s).toLowerCase()};if(name==='./product-filters')return{categoryLabel:(id,categories)=>categories.find(c=>c.id===id)?.name||''};throw Error(name)}});
 const props={categories:[{id:1,name:'ورد'}],value:null,label:'قسم الصنف',onChange:id=>chosen=id};
 function render(){cleanups.forEach(fn=>fn?.());cleanups=[];cursor=refCursor=0;effects=[];const tree=module.exports.default(props);refs[0].current={getBoundingClientRect:()=>({top:220,bottom:260,right:370}),contains:node=>node==='trigger',focus(){}};refs[1].current={contains:node=>node==='popup'};cleanups=effects.map(fn=>fn());return tree}
 function fire(name,type,node){listeners.get(name+':'+type)?.({target:node})}
 function open(){let tree=render();tree.props.children[0].props.onClick();return render()}
 return{states,viewport,win,render,fire,open,get chosen(){return chosen},listeners};
}
test('keyboard resize and focus scrolling keep the category popup open and inside the visible viewport',()=>{const f=fixture();f.open();f.viewport.height=310;f.win.innerHeight=310;for(const[name,type]of[['window','resize'],['window','scroll'],['visual','resize'],['visual','scroll']]){f.fire(name,type,'document');assert.equal(f.states[0],true)}const position=f.states[2];assert.ok(position.top>=12);assert.ok(position.top+position.height<=298);assert.ok(position.left+position.width<=378)});
test('outside tap still dismisses, while taps inside the popup or trigger do not',()=>{const f=fixture();f.open();f.fire('document','pointerdown','popup');assert.equal(f.states[0],true);f.fire('document','pointerdown','trigger');assert.equal(f.states[0],true);f.fire('document','pointerdown','outside');assert.equal(f.states[0],false);f.render();assert.equal(f.listeners.size,0)});
test('selection and Escape still close the popup',()=>{const f=fixture(),tree=f.open(),popup=tree.props.children[1],options=popup.props.children[1];options.props.children[1][0].props.onClick();assert.equal(f.chosen,1);assert.equal(f.states[0],false);const again=f.open();again.props.children[1].props.onKeyDown({key:'Escape',stopPropagation(){}});assert.equal(f.states[0],false)});

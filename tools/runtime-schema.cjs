const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.join(__dirname,'..'),tables={},alters=[];
for(const name of fs.readdirSync(path.join(root,'worker')).filter(name=>name.endsWith('.ts')&&!name.includes('.generated'))){
 const source=ts.createSourceFile(name,fs.readFileSync(path.join(root,'worker',name),'utf8'),ts.ScriptTarget.Latest,true);
 const visit=node=>{if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node)){const sql=node.text,match=sql.match(/^CREATE TABLE(?: IF NOT EXISTS)?\s+["`]?([a-z_]+)["`]?\s*\(/i);if(match&&(!tables[match[1]]||tables[match[1]].length<sql.length))tables[match[1]]=sql;if(/^ALTER TABLE \w+ ADD COLUMN \w+ /i.test(sql))alters.push(sql)}
 if(ts.isArrayLiteralExpression(node)&&node.elements.length&&node.elements.every(e=>ts.isArrayLiteralExpression(e)&&e.elements.length===2&&e.elements.every(ts.isStringLiteral))){let parent=node.parent;while(parent&&!ts.isFunctionDeclaration(parent))parent=parent.parent;if(parent){const m=parent.getText(source).match(/ALTER TABLE (\w+) ADD COLUMN \$\{/);if(m)for(const pair of node.elements)alters.push('ALTER TABLE '+m[1]+' ADD COLUMN '+pair.elements[0].text+' '+pair.elements[1].text)}}
 ts.forEachChild(node,visit)};visit(source);
}
fs.mkdirSync(path.join(root,'outputs'),{recursive:true});fs.writeFileSync(path.join(root,'outputs/runtime-schema.json'),JSON.stringify(tables,null,2));console.log(`Extracted ${Object.keys(tables).length} runtime table definitions; no data rows.`);
fs.writeFileSync(path.join(root,'outputs/runtime-alters.json'),JSON.stringify([...new Set(alters)],null,2));

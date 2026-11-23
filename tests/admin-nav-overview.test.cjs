const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const allPages=["نظرة عامة","التحليلات","الطلبات","الزبائن","المنتجات","الأقسام","المتغيرات والمخزون","الهايلايتس","استيراد الأصناف","المشتريات والموردون","الشحن والمناطق","مراجعات المنتجات","العروض والمحتوى","سياسات المتجر","نصوص الواجهة","الخصومات وأكواد الخصم","الإعدادات","المستخدمون والصلاحيات","مجموعات الصلاحيات","سجل الحركات"];
test('1.9.8: sidebar keeps every admin page exactly once in six groups, three of them folding',()=>{
 const nav=read('app/admin/AdminNav.tsx');
 const block=nav.slice(nav.indexOf('export const adminNavGroups'),nav.indexOf('];',nav.indexOf('export const adminNavGroups')));
 const items=[...block.matchAll(/items:\[([^\]]*)\]/g)].flatMap(m=>[...m[1].matchAll(/"([^"]+)"/g)].map(x=>x[1]));
 assert.deepEqual([...items].sort(),[...allPages].sort());
 assert.equal((block.match(/collapsible:true/g)||[]).length,3);
 for(const item of allPages)assert.ok(nav.includes(`"${item}":[`),'icon for '+item);
 assert.match(nav,/open\[group\.key\]\?\?containsActive/,'group with the open page unfolds by itself');
 assert.match(nav,/canModule\(item\)/,'permissions still filter the menu');
 const page=read('app/admin/page.tsx');
 assert.match(page,/<AdminNav tab=\{tab\} canModule=\{canModule\} onNavigate=\{navigate\}/);
 assert.doesNotMatch(page,/const navigation=\[/);
});
test('1.9.8: overview opens with what needs attention and one switchable chart',()=>{
 const d=read('app/admin/Dashboard.tsx');
 const view=d.slice(d.indexOf('export function DashboardView'),d.indexOf('export default function Dashboard'));
 assert.ok(view.indexOf('attentionSection')<view.indexOf('metricGrid'),'attention cards come before the numbers');
 for(const target of ["'الطلبات','new'","'الطلبات','preparing'","'المنتجات','soldout'","'المنتجات','low'"])assert.ok(view.includes(target),target);
 assert.match(view,/<ChartSwitch data=\{data\.chart\}\/>/);
 assert.match(view,/<details className="dashboardPanel engagementPanel">/);
 assert.doesNotMatch(view,/orderActionBanner|liveSummary|dashWelcome/,'duplicate order banners removed');
 const css=read('app/admin/admin.css');
 assert.match(css,/\.attentionGrid\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
 assert.match(css,/@media\(max-width:1050px\)\{\.attentionGrid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}\}/);
});

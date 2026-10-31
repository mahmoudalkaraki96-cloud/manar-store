type Theme={primaryColor?:unknown;secondaryColor?:unknown;backgroundColor?:unknown};
const color=(value:unknown,fallback:string)=>typeof value==="string"&&/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)?value:fallback;
// Only validated hex colors enter server-rendered CSS.
export function storeThemeCss(theme:Theme){
 const primary=color(theme.primaryColor,"#475569"),secondary=color(theme.secondaryColor,"#94a3b8"),background=color(theme.backgroundColor,"#ffffff");
 return `:root{--green:${primary};--gold:${secondary};--pageBg:${background};color-scheme:light}body{background:${background}}.storeShell .shopHeaderWrap,.storeShellContent>main{--green:${primary}!important;--gold:${secondary}!important}.storeShellContent>main{background:${background}!important}`;
}

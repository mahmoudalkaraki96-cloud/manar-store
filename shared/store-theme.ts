type Theme={primaryColor?:unknown;secondaryColor?:unknown;backgroundColor?:unknown;theme?:unknown};
const color=(value:unknown,fallback:string)=>typeof value==="string"&&/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)?value:fallback;

// Themes are data shared by every store. "standard" is the store design as it was before themes existed.
export const themes={standard:{label:"الأساسي"}} as const;
export const radiusOptions={standard:{label:"افتراضية",scale:1},sharp:{label:"حادة",scale:0.4},round:{label:"دائرية",scale:1.5}} as const;
export type ThemeId=keyof typeof themes;
export type RadiusOption=keyof typeof radiusOptions;
export type ThemeSettings={id:ThemeId;radius:RadiusOption};
export const defaultTheme:ThemeSettings={id:"standard",radius:"standard"};

const own=(table:object,key:unknown)=>typeof key==="string"&&Object.prototype.hasOwnProperty.call(table,key);
export function normalizeTheme(value:unknown):ThemeSettings{
 const row=value&&typeof value==="object"?value as Record<string,unknown>:{};
 return {id:own(themes,row.id)?row.id as ThemeId:defaultTheme.id,radius:own(radiusOptions,row.radius)?row.radius as RadiusOption:defaultTheme.radius};
}
export function validateTheme(value:unknown):ThemeSettings{
 const row=value&&typeof value==="object"?value as Record<string,unknown>:null;
 if(!row||!own(themes,row.id))throw new Error("الثيم غير موجود في هذه النسخة من المتجر");
 if(row.radius!==undefined&&!own(radiusOptions,row.radius))throw new Error("شكل الزوايا غير صالح");
 return normalizeTheme(row);
}

// Only validated hex colors and known theme options enter server-rendered CSS.
export function storeThemeCss(theme:Theme){
 const primary=color(theme.primaryColor,"#475569"),secondary=color(theme.secondaryColor,"#94a3b8"),background=color(theme.backgroundColor,"#ffffff");
 const design=normalizeTheme(theme.theme);
 return `:root{--green:${primary};--gold:${secondary};--pageBg:${background};--theme-radius:${radiusOptions[design.radius].scale};color-scheme:light}body{background:${background}}.storeShell .shopHeaderWrap,.storeShellContent>main{--green:${primary}!important;--gold:${secondary}!important}.storeShellContent>main{background:${background}!important}`;
}

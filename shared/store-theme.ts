type Theme={primaryColor?:unknown;secondaryColor?:unknown;backgroundColor?:unknown;theme?:unknown};
const color=(value:unknown,fallback:string)=>typeof value==="string"&&/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)?value:fallback;

// Themes are data shared by every store. Each one is a label plus design tokens (CSS custom properties named --theme-*)
// and, when it needs more than tokens, rules scoped to html[data-theme="<id>"] in app/themes/<id>.css.
// "standard" is the store design as it was before themes existed, so it has no tokens and no rules.
// font: a Google Fonts family query (letters, digits, spaces, +:;@,.) loaded only on stores using the theme.
type ThemeDefinition={label:string;tokens:Readonly<Record<string,string>>;font?:string};
export const themes={
 standard:{label:"الأساسي",tokens:{}},
 // 1.9.1: photo-led home-goods layout (Rokon). Store colours stay from settings; rules live in app/themes/rooms.css.
 rooms:{label:"غرف البيت",tokens:{"--theme-font":"Almarai"},font:"Almarai:wght@400;700;800"}
} as const satisfies Record<string,ThemeDefinition>;
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
export const knownThemeId=(value:unknown):ThemeId|null=>own(themes,value)?value as ThemeId:null;
// A theme preview (?theme_preview=<id>) only changes how this visitor's page looks; nothing is saved.
export const previewThemeId=(search:string):ThemeId|null=>knownThemeId(new URLSearchParams(search).get("theme_preview"));
export function withPreview(value:unknown,preview:ThemeId|null):ThemeSettings{const theme=normalizeTheme(value);return preview?{...theme,id:preview}:theme}
const tokenName=/^--theme-[a-z][a-z0-9-]*$/,tokenValue=/^[^<>{};\\]*$/;
export function themeTokensCss(id:ThemeId){
 return Object.entries(themes[id].tokens as Record<string,string>).filter(([name,value])=>tokenName.test(name)&&tokenValue.test(value)).map(([name,value])=>name+":"+value+";").join("");
}
const fontQuery=/^[A-Za-z0-9 +:;@,.]{1,120}$/;
/** Stylesheet link for the theme's font, or "" when the theme uses the store default (Tajawal). */
export function themeFontLink(id:ThemeId){
 const font=(themes[id] as ThemeDefinition).font;
 return font&&fontQuery.test(font)?'<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family='+font.replace(/ /g,"+")+'&display=swap">':"";
}
/** Writes the theme on <html> (data-theme, plus data-theme-preview while previewing) so theme rules apply before first paint. */
export function setHtmlTheme(html:string,id:ThemeId,preview:boolean){
 return html.replace(/<html\b([^>]*)>/i,(_match,attrs:string)=>"<html"+attrs.replace(/\sdata-theme(?:-preview)?\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,"")+' data-theme="'+id+'"'+(preview?' data-theme-preview="'+id+'"':"")+">");
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
 return `:root{--green:${primary};--gold:${secondary};--pageBg:${background};--theme-radius:${radiusOptions[design.radius].scale};${themeTokensCss(design.id)}color-scheme:light}body{background:${background}}.storeShell .shopHeaderWrap,.storeShellContent>main{--green:${primary}!important;--gold:${secondary}!important}.storeShellContent>main{background:${background}!important}`;
}

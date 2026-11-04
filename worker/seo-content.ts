// HTML and crawler files that search engines can read without running the store's JavaScript.
// StoreSeo removes the #storefront-seo-content block once the real page has loaded its catalog.
export function xmlEscape(value:string){return value.replace(/[<>&'"]/g,character=>({"<":"&lt;",">":"&gt;","&":"&amp;","'":"&apos;",'"':"&quot;"}[character]||character))}
export function htmlEscape(value:string){return value.replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]||character))}

export type SitemapPage={loc:string;lastmod?:number;images?:string[]};
export type SeoImage={url:string;alt?:string};
export type SeoProductCard={id:number;name:string;priceAgorot:number;image?:string};
type SeoLink={name:string;slug:string};

const price=(agorot:number)=>(Number(agorot||0)/100).toFixed(2)+" ₪";
const categoryHref=(slug:string)=>"/category/"+encodeURIComponent(slug);
const block=(content:string)=>'<section id="storefront-seo-content" class="seoContent" dir="rtl">'+content+"</section>";
const image=(url:string,alt:string)=>'<img src="'+htmlEscape(url)+'" alt="'+htmlEscape(alt)+'" loading="lazy" decoding="async">';

// The storefront pages read these public endpoints, so a crawler that renders the page needs them too.
export function robotsTxt(origin:string){
  return "User-agent: *\nAllow: /\nAllow: /api/catalog\nAllow: /api/storefront\nAllow: /api/seo\nDisallow: /api/\nDisallow: /account\nSitemap: "+origin+"/sitemap.xml\n";
}

export function sitemapXml(pages:SitemapPage[]){
  const row=(page:SitemapPage)=>"  <url><loc>"+xmlEscape(page.loc)+"</loc>"+(page.lastmod?"<lastmod>"+new Date(page.lastmod).toISOString()+"</lastmod>":"")+(page.images||[]).map(url=>"<image:image><image:loc>"+xmlEscape(url)+"</image:loc></image:image>").join("")+"</url>";
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n'+pages.map(row).join("\n")+"\n</urlset>";
}

export function productSeoContent(input:{name:string;description:string;priceAgorot:number;images:SeoImage[];category?:SeoLink|null}){
  const images=input.images.map((item,index)=>image(item.url,item.alt||(index?input.name+" "+(index+1):input.name))).join("");
  return block("<h1>"+htmlEscape(input.name)+"</h1>"+(input.category?'<p><a href="'+htmlEscape(categoryHref(input.category.slug))+'">'+htmlEscape(input.category.name)+"</a></p>":"")+"<p><b>"+price(input.priceAgorot)+"</b></p>"+(input.description?"<p>"+htmlEscape(input.description)+"</p>":"")+(images?'<div class="seoContentGrid">'+images+"</div>":""));
}

export function categorySeoContent(input:{name:string;description:string;subcategories:SeoLink[];products:SeoProductCard[]}){
  const subcategories=input.subcategories.map(item=>'<li><a href="'+htmlEscape(categoryHref(item.slug))+'">'+htmlEscape(item.name)+"</a></li>").join("");
  const products=input.products.map(item=>'<a href="/product/'+Number(item.id)+'">'+(item.image?image(item.image,item.name):"")+"<span>"+htmlEscape(item.name)+"</span><b>"+price(item.priceAgorot)+"</b></a>").join("");
  return block("<h1>"+htmlEscape(input.name)+"</h1>"+(input.description?"<p>"+htmlEscape(input.description)+"</p>":"")+(subcategories?"<ul>"+subcategories+"</ul>":"")+(products?'<div class="seoContentGrid">'+products+"</div>":""));
}

// Uses the last </body> because the serialized app payload can contain the same text inside a script.
export function insertSeoContent(html:string,content:string){
  const index=html.lastIndexOf("</body>");
  return !content||index<0?html:html.slice(0,index)+content+html.slice(index);
}

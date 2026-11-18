"use client";
import Link from "next/link";
import {catalogText} from "../catalog-types";
import type {Category,Product} from "../catalog-types";
import {useStoreLanguage} from "../store-language";

/**
 * "Shop by room" cards for the rooms theme: one large photo card per top-level category.
 * The photo is the category banner, else the first product photo in that category tree, else its icon.
 */
export default function RoomCards({categories,products}:{categories:Category[];products:Product[]}){
 const {t,language,number}=useStoreLanguage();
 const roots=categories.filter(category=>category.parentId==null);
 if(!roots.length)return null;
 const tree=(rootId:number)=>{const ids=new Set<number>([rootId]);let added=true;while(added){added=false;for(const category of categories)if(category.parentId!=null&&ids.has(category.parentId)&&!ids.has(category.id)){ids.add(category.id);added=true}}return ids};
 return <section className="roomCards" aria-labelledby="roomCardsTitle">
  <div className="roomCardsHead"><h2 id="roomCardsTitle">{t("rooms.title")}</h2></div>
  <div className="roomCardsGrid">{roots.map(category=>{
   const ids=tree(category.id),photo=category.bannerUrl||products.find(product=>product.categoryId!=null&&ids.has(product.categoryId)&&product.image)?.image||category.iconUrl||"";
   const subs=categories.filter(child=>child.parentId===category.id).length;
   return <Link key={category.id} className="roomCard" href={`/category/${category.slug}`}>
    {photo?<img src={photo} alt="" loading="lazy" decoding="async"/>:<span className="roomCardBlank" aria-hidden="true"/>}
    <span className="roomCardLabel"><span><b>{catalogText(category,language,"name")||category.name}</b>{subs>0&&<small>{t("rooms.sections",{count:number(subs)})}</small>}</span><i className="dirFlip" aria-hidden="true">←</i></span>
   </Link>})}</div>
 </section>;
}

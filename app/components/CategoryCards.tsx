"use client";
import Link from "next/link";
import type {Category} from "../catalog-types";

export default function CategoryCards({categories}:{categories:Category[]}){
 if(!categories.length)return null;
 return <nav className="categoryCards" aria-label="تصفّح الأقسام الفرعية">{categories.map(category=><Link className="categoryCard" key={category.id} href={`/category/${category.slug}`}><span className="categoryCardIcon" aria-hidden="true">{category.iconUrl?<img src={category.iconUrl} alt="" loading="lazy" decoding="async" onError={event=>{event.currentTarget.style.display="none";event.currentTarget.parentElement?.classList.add("categoryIconUnavailable")}}/>:"▦"}</span><span className="categoryCardName">{category.name}</span><span className="categoryCardArrow" aria-hidden="true">←</span></Link>)}</nav>;
}


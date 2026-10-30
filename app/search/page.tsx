import SearchResultsClient from "./SearchResultsClient";

export const metadata={title:"نتائج البحث",robots:{index:false,follow:false}};

export default async function SearchPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const params=await searchParams;
 const value=params.q;
 const initialQuery=Array.isArray(value)?value[0]||"":value||"";
 return <SearchResultsClient initialQuery={initialQuery}/>;
}

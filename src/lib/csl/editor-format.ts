import CSL from "citeproc";
import defaults from "./defaults.json";
import styles from "./styles.json";
import type {Reference} from "@/components/editor/types";
const xml:Record<string,string>={APA:defaults.apa,Harvard:defaults.harvard,Chicago:styles["chicago-author-date"],IEEE:styles.ieee};
const cache=new Map<string,{full:string;inText:string}>();
/** Deterministic local formatting: no network, LLM or changes to provenance. */
export function formatEditorReference(r:Reference,style:string):{full:string;inText:string}|null {
 if(!xml[style])return null;
 const key=JSON.stringify([style,r.id,r.type,r.title,r.authors,r.year,r.source,r.doi,r.url,r.volume,r.issue,r.pages,r.csl]);
 const cached=cache.get(key);if(cached)return cached;
 try{
  // Current editable fields override imported metadata; structured names are used while unchanged.
  const importedAuthors=(r.csl?.author||[]).map(a=>a.literal||[a.family,a.given].filter(Boolean).join(", ")).join("; ");
  const author=r.csl?.author && importedAuthors===r.authors?r.csl.author:r.authors.split(/;| & | and /).map(literal=>({literal:literal.trim()}));
  const item={...r.csl,id:r.id,type:r.type==="article"?"article-journal":r.type==="web"?"webpage":r.type,title:r.title,author,issued:/^\d{4}$/.test(r.year)?{"date-parts":[[Number(r.year)]]}:undefined,"container-title":r.source,DOI:r.doi,URL:r.url,volume:r.volume,issue:r.issue,page:r.pages};
  const engine=new CSL.Engine({retrieveLocale:()=>defaults.locale,retrieveItem:()=>item},xml[style],"en-US");
  engine.setOutputFormat("text");engine.updateItems([r.id]);
  const bibliography=engine.makeBibliography();if(!bibliography)return null;
  const result={full:bibliography[1].join("").trim().replace(style==="IEEE"?/^\[1\]\s*/:/^$/, ""),inText:engine.makeCitationCluster([{id:r.id}])};
  if(cache.size>=200)cache.delete(cache.keys().next().value!);cache.set(key,result);return result;
 }catch{return null;}
}

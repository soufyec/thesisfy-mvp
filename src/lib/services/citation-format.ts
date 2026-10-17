import { Cite, plugins, type CSL } from "@citation-js/core";
import "@citation-js/plugin-csl";
import "@citation-js/plugin-bibtex";
import "@citation-js/plugin-ris";
import styles from "../csl/styles.json";
import type { Reference } from "../db";
for (const [id,xml] of Object.entries(styles)) plugins.config.get("@csl").styles.add(id,xml);
export const CSL_STYLES={APA:"apa",Chicago:"chicago-author-date",IEEE:"ieee",Harvard:"harvard1"} as const;
export type CitationStyle=keyof typeof CSL_STYLES;
/** Whitelisted CSL metadata, no arbitrary URLs, scripts, plugin graphs or remote parsers. */
export function cleanCSL(raw:unknown,id:string):CSL {
  if(!raw || typeof raw!=="object")throw new Error("invalid_reference");
  const o=raw as Record<string,unknown>;
  const text=(v:unknown,max=1000)=>typeof v==="string"?v.replace(/<[^>]*>/g,"").slice(0,max):"";
  const types=["article-journal","book","chapter","webpage","thesis","report","paper-conference","dataset"];
  const out:CSL={id,type:(types.includes(String(o.type))?o.type:"article-journal") as CSL["type"],title:text(o.title)};
  if(!out.title)throw new Error("invalid_reference");
  for(const k of ["container-title","publisher","volume","issue","page","DOI"] as const){const value=text(o[k]);if(value)out[k]=value;}
  const url=text(o.URL);if(/^https?:\/\//i.test(url))out.URL=url;
  if(Array.isArray(o.author))out.author=o.author.slice(0,100).filter(a=>a&&typeof a==="object").map(a=>({family:text(a.family,200),given:text(a.given,200),literal:text(a.literal,200)}));
  const date=(o.issued as CSL["issued"])?.["date-parts"]?.[0];
  if(Array.isArray(date) && /^\d{4}$/.test(String(date[0])))out.issued={"date-parts":[[Number(date[0])]]};
  return out;
}
export function parseBibliography(content:string,kind:"bib"|"ris"):CSL[]{
  if(!content.trim() || Buffer.byteLength(content)>500_000)throw new Error("invalid_input");
  const cite=new Cite(content,{forceType:kind==="bib"?"@bibtex/text":"@ris/file",maxChainLength:10,generateGraph:false,strict:true,target:"@csl/list+object"});
  if(!cite.data.length || cite.data.length>200)throw new Error("reference_limit");
  return cite.data.map((r,i)=>cleanCSL(r,`import_${i}`));
}
export function referenceToCSL(r:Reference):CSL {
  return cleanCSL(r.csl || {id:r.id,type:r.type==="article"?"article-journal":r.type==="web"?"webpage":r.type,title:r.title,author:r.authors.split(/;| & | and /).map(literal=>({literal:literal.trim()})),issued:{"date-parts":[[r.year]]},"container-title":r.source,DOI:r.doi,URL:r.url,page:r.pages,volume:r.volume,issue:r.issue},r.id);
}
export function formatCitations(items:CSL[],style:CitationStyle,language="en-US") {
  if(!Object.hasOwn(CSL_STYLES,style) || !["en-US","es-ES","fr-FR","de-DE"].includes(language) || !items.length || items.length>200)throw new Error("invalid_input");
  const cite=new Cite(items.map((r,i)=>cleanCSL(r,String(r.id||i))));
  return {bibliography:cite.format("bibliography",{style:CSL_STYLES[style],lang:language,format:"text",asEntryArray:true}),citations:items.map(r=>({id:String(r.id),text:cite.format("citation",{style:CSL_STYLES[style],lang:language,format:"text",entry:String(r.id),citationsPre:[],citationsPost:[]})}))};
}
export function cslToReference(c:CSL,id:string):Reference {
  const r=cleanCSL(c,id);
  return {id,csl:r,type:r.type==="book"?"book":r.type==="chapter"?"chapter":r.type==="thesis"?"thesis":r.type==="webpage"?"web":"article",title:r.title||"",authors:(r.author||[]).map(a=>a.literal||[a.family,a.given].filter(Boolean).join(", ")).join("; "),year:String(r.issued?.["date-parts"]?.[0]?.[0]||""),source:r["container-title"]||r.publisher||"",doi:r.DOI,url:r.URL,pages:r.page===undefined?undefined:String(r.page),volume:r.volume===undefined?undefined:String(r.volume),issue:r.issue===undefined?undefined:String(r.issue)};
}

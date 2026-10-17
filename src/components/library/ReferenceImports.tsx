"use client";
import {useRef,useState} from "react";
import {useT} from "@/lib/i18n/client";
type Item={key:string;csl:{title:string}};
export function ReferenceImports({onImported}:{onImported:()=>void}){
 const t=useT();const file=useRef<HTMLInputElement>(null);
 const [busy,setBusy]=useState(false),[failed,setFailed]=useState(false),[connected,setConnected]=useState(false);
 const [key,setKey]=useState(""),[libraryId,setLibraryId]=useState(""),[items,setItems]=useState<Item[]>([]),[selected,setSelected]=useState<string[]>([]),[start,setStart]=useState(0);
 async function call(url:string,init?:RequestInit){const r=await fetch(url,init);if(!r.ok)throw new Error();return r.json();}
 async function run(action:()=>Promise<void>){setBusy(true);setFailed(false);try{await action();}catch{setFailed(true);}finally{setBusy(false);}}
 async function load(offset=0){const d=await call(`/api/zotero?start=${offset}`);setConnected(d.connected);setItems(d.items||[]);setSelected([]);setStart(offset);}
 return <details className="border border-gray-200 rounded-lg p-3 text-sm" onToggle={e=>{if(e.currentTarget.open)void run(()=>load());}}>
  <summary className="cursor-pointer font-medium">{t("engines.imports")}</summary>
  <div className="space-y-3 mt-3">
   <label className="block">{t("engines.bibFile")}<input ref={file} className="block mt-1 max-w-full" type="file" accept=".bib,.ris" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void run(async()=>{if(f.size>500000)throw new Error();const kind=f.name.toLowerCase().endsWith(".ris")?"ris":"bib";await call(`/api/citations/import?format=${kind}`,{method:"POST",headers:{"Content-Type":"text/plain"},body:await f.text()});if(file.current)file.current.value="";onImported();});}}/></label>
   {!connected?<form className="space-y-2" onSubmit={e=>{e.preventDefault();void run(async()=>{try{await call("/api/zotero",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({libraryId,key})});await load();}finally{setKey("");}});}}>
    <a href="https://www.zotero.org/settings/keys/new" target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">{t("engines.zoteroKeyHelp")}</a>
    <label className="block">{t("engines.zoteroId")}<input className="input-field" inputMode="numeric" required pattern="[0-9]{1,12}" value={libraryId} onChange={e=>setLibraryId(e.target.value)}/></label>
    <label className="block">{t("engines.zoteroKey")}<input className="input-field" type="password" autoComplete="off" required value={key} onChange={e=>setKey(e.target.value)}/></label>
    <button className="btn-outline" disabled={busy}>{t("engines.connect")}</button>
   </form>:<>
    {items.map(i=><label className="flex items-start gap-2" key={i.key}><input type="checkbox" disabled={busy} checked={selected.includes(i.key)} onChange={e=>setSelected(old=>e.target.checked?[...old,i.key]:old.filter(k=>k!==i.key))}/><span>{i.csl.title}</span></label>)}
    <div className="flex flex-wrap gap-2">
     <button type="button" className="btn-outline" disabled={busy||!start} onClick={()=>void run(()=>load(Math.max(0,start-50)))}>{t("engines.previous")}</button>
     <button type="button" className="btn-outline" disabled={busy||items.length<50} onClick={()=>void run(()=>load(start+50))}>{t("engines.next")}</button>
     <button type="button" className="btn-primary" disabled={busy||!selected.length} onClick={()=>void run(async()=>{await call("/api/zotero",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({keys:selected,start})});setSelected([]);onImported();})}>{t("engines.importSelected")}</button>
     <button type="button" className="btn-outline" disabled={busy} onClick={()=>void run(async()=>{await call("/api/zotero",{method:"DELETE"});setConnected(false);setItems([]);setSelected([]);})}>{t("engines.disconnect")}</button>
    </div>
   </>}
   {busy&&<p role="status">{t("engines.busy")}</p>}{failed&&<p role="alert" className="text-red-700">{t("engines.error")}</p>}
  </div>
 </details>;
}

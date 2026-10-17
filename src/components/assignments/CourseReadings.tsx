"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {useT} from "@/lib/i18n/client";
interface Reading {id:string;name:string;pages:number}
export function CourseReadings({assignmentId}:{assignmentId:string}) {
  const t=useT();const input=useRef<HTMLInputElement>(null);
  const [data,setData]=useState<{readings:Reading[];officialOnly:boolean}|null>(null);
  const [busy,setBusy]=useState(false);const [failed,setFailed]=useState(false);
  const url=`/api/assignments/${encodeURIComponent(assignmentId)}/readings`;
  const load=useCallback(async(signal?:AbortSignal)=>{const r=await fetch(url,{signal});if(!r.ok)throw new Error();setData(await r.json());},[url]);
  useEffect(()=>{const controller=new AbortController();load(controller.signal).catch(()=>{if(!controller.signal.aborted)setFailed(true);});return()=>controller.abort();},[load]);
  async function mutate(method:string,body?:BodyInit,suffix=""){
    setBusy(true);setFailed(false);
    try{const r=await fetch(url+suffix,{method,body,headers:typeof body==="string"?{"Content-Type":"application/json"}:undefined});if(!r.ok)throw new Error();await load();}
    catch{setFailed(true);}finally{setBusy(false);if(input.current)input.current.value="";}
  }
  return <section className="card p-4 space-y-3" aria-busy={busy}>
    <h2 className="font-semibold text-sm">{t("engines.readings")}</h2>
    {data && <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={data.officialOnly} disabled={busy} onChange={e=>void mutate("PATCH",JSON.stringify({officialOnly:e.target.checked}))}/>{t("engines.official")}</label>}
    <p className="text-xs text-gray-500">{t("engines.limit")}</p>
    <input ref={input} type="file" accept=".pdf,application/pdf" className="text-sm max-w-full" aria-label={t("engines.upload")} disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file){if(file.size>3_990_000){setFailed(true);return;}const form=new FormData();form.set("file",file);void mutate("POST",form);}}}/>
    {data?.readings.map(r=><div key={r.id} className="flex justify-between gap-3 text-sm"><span className="break-all">{r.name}</span><button type="button" className="text-red-700 underline" disabled={busy} aria-label={`${t("engines.remove")} ${r.name}`} onClick={()=>void mutate("DELETE",undefined,`?reading=${encodeURIComponent(r.id)}`)}>{t("engines.remove")}</button></div>)}
    {data && !data.readings.length && <p className="text-xs text-gray-500">{t("engines.empty")}</p>}
    {busy && <p role="status" className="text-sm">{t("engines.busy")}</p>}
    {failed && <p role="alert" className="text-sm text-red-700">{t("engines.error")}</p>}
  </section>;
}

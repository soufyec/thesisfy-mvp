import { randomUUID, createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/api";
import { canManageAssignment } from "@/lib/auth";
import { extractFromPdf } from "@/lib/sources/extract";
import { embedPrivate } from "@/lib/services/private-engines";
import { isRecipient } from "../../shared";
export const runtime = "nodejs";
export const maxDuration = 300;
const reply = (value: unknown, status=200) => NextResponse.json(value,{status,headers:{"Cache-Control":"no-store"}});
type Context = {params: Promise<{id:string}>};
async function access(request: NextRequest, ctx: Context, write=false) {
  const auth=await requireUser(request);
  if ("response" in auth) return {response:auth.response};
  const a=db.assignments.findById((await ctx.params).id);
  if (!a || auth.user.university!==a.university || !(canManageAssignment(auth.user,a) || (!write && auth.user.role==="student" && isRecipient(a,auth.user.id)))) return {response:reply({code:"not_found"},404)};
  return {a};
}
export async function GET(request: NextRequest, ctx: Context) {
  const auth=await access(request,ctx); if ("response" in auth) return auth.response;
  try { return reply({readings:await db.courseReadings.list(auth.a.university,auth.a.id),officialOnly:!!auth.a.officialReadingsOnly}); }
  catch { return reply({code:"readings_unavailable"},503); }
}
export async function POST(request: NextRequest, ctx: Context) {
  const auth=await access(request,ctx,true); if ("response" in auth) return auth.response;
  try {
    // Stream cap applies even when Content-Length is missing or forged.
    const reader=request.body?.getReader(); if (!reader) return reply({code:"invalid_file"},400);
    const parts:Uint8Array[]=[];let size=0;
    try { for (;;) { const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>4_000_000){await reader.cancel();return reply({code:"file_too_large"},413);}parts.push(part.value); } }
    finally {reader.releaseLock();}
    const form=await new Response(Buffer.concat(parts),{headers:{"Content-Type":request.headers.get("content-type")||""}}).formData();
    const file=form.get("file");if(!file || typeof file==="string" || !file.name.toLowerCase().endsWith(".pdf"))return reply({code:"invalid_file"},400);
    const bytes=Buffer.from(await file.arrayBuffer());
    const parsed=await extractFromPdf(bytes);
    if(parsed.status!=="parsed")return reply({code:"pdf_text_required"},422);
    const chunks:{page:number;text:string;vector:number[]}[]=[];
    for(let page=0;page<parsed.pages.length;page++){
      const text=parsed.pages[page].replace(/\s+/g," ").trim();
      for(let i=0;i<text.length;i+=1500) if(text.slice(i,i+1800).trim())chunks.push({page:page+1,text:text.slice(i,i+1800),vector:[]});
    }
    if(!chunks.length || chunks.length>200)return reply({code:"reading_too_long"},422);
    for(let i=0;i<chunks.length;i+=12){const batch=chunks.slice(i,i+12);const vectors=await embedPrivate(batch.map(c=>c.text));batch.forEach((c,j)=>{c.vector=vectors[j];});}
    const id=await db.courseReadings.insert({university:auth.a.university,assignmentId:auth.a.id},{id:randomUUID(),name:file.name.replace(/[\x00-\x1f]/g,"").slice(0,200),pages:parsed.pageCount,digest:createHash("sha256").update(bytes).digest("hex"),createdAt:new Date().toISOString()},chunks);
    return reply({id},201);
  }catch{return reply({code:"reading_index_failed"},503);}
}
export async function PATCH(request: NextRequest, ctx: Context) {
  const auth=await access(request,ctx,true);if("response" in auth)return auth.response;
  const body=await request.json().catch(()=>null);
  if(typeof body?.officialOnly!=="boolean")return reply({code:"invalid_input"},400);
  db.assignments.update(auth.a.id,{officialReadingsOnly:body.officialOnly});
  await db.flush();return reply({officialOnly:body.officialOnly});
}
export async function DELETE(request: NextRequest, ctx: Context) {
  const auth=await access(request,ctx,true);if("response" in auth)return auth.response;
  const id=request.nextUrl.searchParams.get("reading");if(!id || id.length>100)return reply({code:"invalid_input"},400);
  try {return reply({removed:await db.courseReadings.remove(auth.a.university,auth.a.id,id)});}
  catch{return reply({code:"readings_unavailable"},503);}
}

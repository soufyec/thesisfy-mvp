import {NextRequest,NextResponse} from "next/server";
import {requireUser} from "@/lib/api";
import {db} from "@/lib/db";
import {formatCitations,referenceToCSL} from "@/lib/services/citation-format";
export async function POST(request:NextRequest){
 const auth=await requireUser(request);if("response" in auth)return auth.response;
 const body=await request.json().catch(()=>null);
 if(!Array.isArray(body?.ids)||!body.ids.length||body.ids.length>200||body.ids.some((x:unknown)=>typeof x!=="string"))return NextResponse.json({code:"invalid_input"},{status:400});
 const refs=body.ids.map((id:string)=>db.libraryReferences.find(auth.user.id,id));
 if(refs.some((r:unknown)=>!r))return NextResponse.json({code:"not_found"},{status:404});
 try{return NextResponse.json(formatCitations(refs.map(referenceToCSL),body.style,body.language),{headers:{"Cache-Control":"no-store"}});}catch{return NextResponse.json({code:"invalid_input"},{status:400});}
}

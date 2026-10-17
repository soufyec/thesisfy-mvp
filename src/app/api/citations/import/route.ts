import {randomUUID} from "crypto";
import {NextRequest,NextResponse} from "next/server";
import {requireUser} from "@/lib/api";
import {db} from "@/lib/db";
import {parseBibliography,cslToReference} from "@/lib/services/citation-format";
import {libraryReferenceView} from "@/lib/sources/library";
export async function POST(request:NextRequest){
 const auth=await requireUser(request);if("response" in auth)return auth.response;
 if(auth.user.role!=="student")return NextResponse.json({code:"forbidden"},{status:403});
 const kind=request.nextUrl.searchParams.get("format");if(kind!=="bib"&&kind!=="ris")return NextResponse.json({code:"invalid_input"},{status:400});
 const reader=request.body?.getReader();if(!reader)return NextResponse.json({code:"invalid_input"},{status:400});
 let size=0;const parts:Uint8Array[]=[];
 try{for(;;){const p=await reader.read();if(p.done)break;size+=p.value.byteLength;if(size>500_000){await reader.cancel();return NextResponse.json({code:"file_too_large"},{status:413});}parts.push(p.value);}}finally{reader.releaseLock();}
 try{
   const parsed=parseBibliography(Buffer.concat(parts).toString("utf8"),kind);
   const references=parsed.map(c=>{const r=cslToReference(c,`ref_${randomUUID()}`);const old=r.doi?db.libraryReferences.findByDoi(auth.user.id,r.doi):undefined;return old||db.libraryReferences.upsert(auth.user.id,r);});
   await db.flush();return NextResponse.json({references:references.map(libraryReferenceView)},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({code:"import_failed"},{status:422});}
}

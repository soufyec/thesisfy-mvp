import {db} from "../db";
import {encrypt,decrypt} from "../crypto";
import {cleanCSL} from "./citation-format";
async function read(libraryId:string,key:string,query:string){
 if(!/^\d{1,12}$/.test(libraryId)||!key)throw new Error("invalid_connection");
 const r=await fetch(`https://api.zotero.org/users/${libraryId}/items/top?${query}`,{headers:{"Zotero-API-Version":"3","Zotero-API-Key":key},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw new Error("zotero_unavailable");
 const body=await r.text();if(body.length>2_000_000)throw new Error("response_too_large");return JSON.parse(body);
}
export async function connectZotero(ownerId:string,libraryId:string,key:string){
 if(!process.env.ENCRYPTION_KEY&&!process.env.JWT_SECRET)throw new Error("encryption_unavailable");
 if(!/^[A-Za-z0-9]{16,64}$/.test(key))throw new Error("invalid_connection");
 await read(libraryId,key,"limit=1&format=json&itemType=-attachment%20%7C%7C%20note");
 await db.zotero.set(ownerId,libraryId,encrypt(key));
}
export async function zoteroItems(ownerId:string,start=0){
 const c=await db.zotero.get(ownerId);if(!c)throw new Error("not_connected");
 if(!Number.isInteger(start)||start<0||start>100000)throw new Error("invalid_input");
 const data=await read(c.libraryId,decrypt(c.encryptedKey),`format=csljson&limit=50&start=${start}&itemType=-attachment%20%7C%7C%20note`);
 const items=data.items;if(!Array.isArray(items)||items.length>50)throw new Error("invalid_response");
 return items.map((r:unknown,i:number)=>{const id=String((r as {id?:unknown})?.id||"");const key=id.split("/").pop()||"";if(!/^[A-Z0-9]{8}$/.test(key))throw new Error("invalid_response");return {key,csl:cleanCSL(r,`zotero_${c.libraryId}_${key}`)};});
}

/** Internal adapter; only db.zotero exposes it to application services. */
import {databasePool,storeConfigured} from "./store";
let initialized:Promise<unknown>|undefined;
async function ready(){if(!storeConfigured)throw new Error("database_unavailable");if(!initialized)initialized=databasePool().query(`CREATE TABLE IF NOT EXISTS thesisfic_zotero_connections(owner_id text PRIMARY KEY, library_id text NOT NULL, encrypted_key text NOT NULL)`).catch(e=>{initialized=undefined;throw e;});await initialized;}
export const zoteroConnections={
 async get(ownerId:string){await ready();return (await databasePool().query<{libraryId:string;encryptedKey:string}>(`SELECT library_id AS "libraryId",encrypted_key AS "encryptedKey" FROM thesisfic_zotero_connections WHERE owner_id=$1`,[ownerId])).rows[0];},
 async set(ownerId:string,libraryId:string,encryptedKey:string){await ready();await databasePool().query(`INSERT INTO thesisfic_zotero_connections(owner_id,library_id,encrypted_key) VALUES($1,$2,$3) ON CONFLICT(owner_id) DO UPDATE SET library_id=$2,encrypted_key=$3`,[ownerId,libraryId,encryptedKey]);},
 async remove(ownerId:string){await ready();await databasePool().query(`DELETE FROM thesisfic_zotero_connections WHERE owner_id=$1`,[ownerId]);},
};

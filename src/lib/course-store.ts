import { passageFingerprints } from "./crypto";
/** Internal persistence adapter. Application code accesses this only through db.courseReadings. */
import { databasePool, storeConfigured } from "./store";
export const EMBEDDING_MODEL = "multilingual-minilm-l12-v2-e8f8c211";
export interface ReadingChunk { page: number; text: string; vector: number[] }
export interface CourseReading { id: string; name: string; pages: number; createdAt: string }
export interface CoursePassage { readingId: string; name: string; page: number; text: string; score: number }
let initializing: Promise<void> | undefined;
async function ready() {
  if (!storeConfigured) throw new Error("database_unavailable");
  if (!initializing) initializing = (async () => {
    const client = await databasePool().connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(74120913)");
      await client.query("CREATE EXTENSION IF NOT EXISTS vector");
      await client.query(`CREATE TABLE IF NOT EXISTS thesisfic_course_readings (
        id text PRIMARY KEY, university text NOT NULL, assignment_id text NOT NULL, name text NOT NULL,
        digest text NOT NULL, pages integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(university, assignment_id, digest))`);
      await client.query(`CREATE TABLE IF NOT EXISTS thesisfic_course_chunks (
        reading_id text NOT NULL REFERENCES thesisfic_course_readings(id) ON DELETE CASCADE,
        ordinal integer NOT NULL, page integer NOT NULL, content text NOT NULL,
        model text NOT NULL, embedding vector(384) NOT NULL, PRIMARY KEY(reading_id, ordinal))`);
      await client.query("ALTER TABLE thesisfic_course_chunks ADD COLUMN IF NOT EXISTS fingerprints text[] NOT NULL DEFAULT ARRAY[]::text[]");
      await client.query("COMMIT");
    } catch (e) { await client.query("ROLLBACK"); throw e; }
    finally { client.release(); }
  })().catch(e => { initializing = undefined; throw e; });
  await initializing;
}
function vector(v: number[]) {
  if (v.length !== 384 || v.some(n => !Number.isFinite(n))) throw new Error("invalid_vector");
  return JSON.stringify(v);
}
export const courseReadings = {
  async list(university: string, assignmentId: string): Promise<CourseReading[]> {
    await ready();
    return (await databasePool().query<CourseReading>(`SELECT id, name, pages, created_at AS "createdAt"
      FROM thesisfic_course_readings WHERE university=$1 AND assignment_id=$2 ORDER BY created_at`, [university, assignmentId])).rows;
  },
  async insert(scope: { university: string; assignmentId: string }, reading: CourseReading & { digest: string }, chunks: ReadingChunk[]) {
    await ready();
    if (!chunks.length || chunks.length > 200) throw new Error("invalid_chunks");
    const client = await databasePool().connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [scope.university + ":" + scope.assignmentId]);
      const existing = await client.query(`SELECT id FROM thesisfic_course_readings WHERE university=$1 AND assignment_id=$2 AND digest=$3`, [scope.university, scope.assignmentId, reading.digest]);
      if (existing.rows.length) { await client.query("COMMIT"); return existing.rows[0].id as string; }
      const count = await client.query(`SELECT count(*)::int AS n FROM thesisfic_course_readings WHERE university=$1 AND assignment_id=$2`, [scope.university, scope.assignmentId]);
      if (count.rows[0].n >= 20) throw new Error("reading_limit");
      await client.query(`INSERT INTO thesisfic_course_readings(id,university,assignment_id,name,digest,pages) VALUES($1,$2,$3,$4,$5,$6)`, [reading.id,scope.university,scope.assignmentId,reading.name,reading.digest,reading.pages]);
      for (let i=0;i<chunks.length;i++) {
        const c=chunks[i];
        await client.query(`INSERT INTO thesisfic_course_chunks(reading_id,ordinal,page,content,model,embedding,fingerprints) VALUES($1,$2,$3,$4,$5,$6::vector,$7::text[])`, [reading.id,i,c.page,c.text,EMBEDDING_MODEL,vector(c.vector),passageFingerprints(c.text)]);
      }
      await client.query("COMMIT"); return reading.id;
    } catch(e) { await client.query("ROLLBACK"); throw e; }
    finally { client.release(); }
  },
  async remove(university: string, assignmentId: string, id: string) {
    await ready();
    return (await databasePool().query(`DELETE FROM thesisfic_course_readings WHERE university=$1 AND assignment_id=$2 AND id=$3`, [university,assignmentId,id])).rowCount === 1;
  },
  async match(university: string, assignmentId: string, fingerprints: string[]) {
    const fps=Array.from(new Set(fingerprints)).filter(f=>/^[0-9a-f]{32}$/.test(f)).slice(0,100);
    if(!fps.length)return null;
    await ready();
    const result=await databasePool().query<{sourceId:string;title:string;page:number;hits:number}>(`SELECT r.id AS "sourceId",r.name AS title,min(c.page)::int AS page,count(DISTINCT f)::int AS hits
      FROM thesisfic_course_readings r JOIN thesisfic_course_chunks c ON c.reading_id=r.id
      CROSS JOIN LATERAL unnest(c.fingerprints) f
      WHERE r.university=$1 AND r.assignment_id=$2 AND f=ANY($3::text[])
      GROUP BY r.id,r.name ORDER BY hits DESC LIMIT 1`,[university,assignmentId,fps]);
    const best=result.rows[0];if(!best)return null;
    const share=Math.min(1,best.hits/Math.max(1,fps.length-1));
    return share>=0.6 || best.hits>=2 ? {sourceId:best.sourceId,title:best.title,page:best.page,share} : null;
  },
  async search(university: string, assignmentId: string, embedding: number[]): Promise<CoursePassage[]> {
    await ready();
    // Exact scoped search: small teaching corpora, no cross-tenant ANN candidate pool.
    return (await databasePool().query<CoursePassage>(`SELECT r.id AS "readingId", r.name, c.page, c.content AS text,
      1-(c.embedding <=> $3::vector) AS score FROM thesisfic_course_chunks c
      JOIN thesisfic_course_readings r ON r.id=c.reading_id
      WHERE r.university=$1 AND r.assignment_id=$2 AND c.model=$4
      ORDER BY c.embedding <=> $3::vector LIMIT 6`, [university,assignmentId,vector(embedding),EMBEDDING_MODEL])).rows.filter(p => p.score >= 0.25);
  },
};

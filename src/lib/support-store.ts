/** Internal adapter: accessed by routes through db.support only. One row per ticket, locked updates. */
import { randomUUID } from "crypto";
import { databasePool, storeConfigured } from "./store";
import type { SupportTicket, SupportMessage } from "./support/types";
let initializing: Promise<unknown> | undefined;
const g = globalThis as unknown as { __supportTickets?: Map<string, SupportTicket> };
const memory = () => g.__supportTickets ||= new Map();
async function ready() {
  if (!storeConfigured) {
    if (process.env.VERCEL_ENV === "production") throw new Error("support_database_unavailable");
    return;
  }
  initializing ||= databasePool().query("CREATE TABLE IF NOT EXISTS thesisfic_support (id text PRIMARY KEY, user_id text NOT NULL, university text NOT NULL, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())").catch(e => { initializing = undefined; throw e; });
  await initializing;
}
export const supportStore = {
  async list(userId?: string): Promise<SupportTicket[]> {
    await ready();
    if (!storeConfigured) return Array.from(memory().values()).filter(t => !userId || t.userId === userId).map(t => structuredClone(t));
    return (await databasePool().query<{ data: SupportTicket }>(`SELECT data FROM thesisfic_support ${userId ? "WHERE user_id=$1" : ""} ORDER BY (data->>'status'='resolved'), (data->>'responseDueAt') ASC LIMIT 500`, userId ? [userId] : [])).rows.map(r => r.data);
  },
  async create(ticket: SupportTicket) {
    await ready();
    if (!storeConfigured) {
      const tickets = Array.from(memory().values()).filter(t => t.userId === ticket.userId);
      if (tickets.filter(t => t.status !== "resolved").length >= 10 || tickets.some(t => Date.parse(t.createdAt) > Date.now() - 15000)) throw new Error("support_rate_limit");
      memory().set(ticket.id, structuredClone(ticket));
    } else {
      const client = await databasePool().connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`support:${ticket.userId}`]);
        const { rows } = await client.query<{ blocked: boolean }>("SELECT (count(*) FILTER (WHERE data->>'status'<>'resolved') >= 10 OR count(*) FILTER (WHERE (data->>'createdAt')::timestamptz > now()-interval '15 seconds') > 0) AS blocked FROM thesisfic_support WHERE user_id=$1", [ticket.userId]);
        if (rows[0]?.blocked) throw new Error("support_rate_limit");
        await client.query("INSERT INTO thesisfic_support(id,user_id,university,data) VALUES($1,$2,$3,$4::jsonb)", [ticket.id, ticket.userId, ticket.university, JSON.stringify(ticket)]);
        await client.query("COMMIT");
      } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
    }
    return ticket;
  },
  async update(id: string, owner: string | undefined, apply: (ticket: SupportTicket) => void): Promise<SupportTicket | null> {
    await ready();
    if (!storeConfigured) {
      const existing = memory().get(id);
      if (!existing || owner && existing.userId !== owner) return null;
      const ticket = structuredClone(existing); apply(ticket); ticket.updatedAt = new Date().toISOString(); memory().set(id, ticket); return ticket;
    }
    const client = await databasePool().connect();
    try {
      await client.query("BEGIN");
      const row = (await client.query<{ data: SupportTicket }>("SELECT data FROM thesisfic_support WHERE id=$1 AND ($2::text IS NULL OR user_id=$2) FOR UPDATE", [id, owner || null])).rows[0];
      if (!row) { await client.query("ROLLBACK"); return null; }
      const ticket = row.data; apply(ticket); ticket.updatedAt = new Date().toISOString();
      await client.query("UPDATE thesisfic_support SET data=$2::jsonb,updated_at=now() WHERE id=$1", [id, JSON.stringify(ticket)]);
      await client.query("COMMIT"); return ticket;
    } catch (e) { await client.query("ROLLBACK"); throw e; }
    finally { client.release(); }
  },
};
export function supportMessage(role: SupportMessage["role"], text: string): SupportMessage {
  return { id: randomUUID(), role, text, at: new Date().toISOString() };
}

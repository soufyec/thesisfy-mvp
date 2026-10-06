/** Runs once per server instance before it serves requests: hydrates the store from Postgres when configured. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { db } = await import("./lib/db");
    await db.ready();
  }
}

import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

/** Type for anything shaped like `db` — either the pool client itself or a `tx` from a transaction/withUserContext callback. Useful for typing helper functions that should work with either. */
export type DbClient = typeof db;

/**
 * Run `callback` inside a transaction with the Postgres session variable
 * `app.current_user_id` set to `userId` — this is what the RLS policies on
 * books / book_clubs / book_club_members / book_club_books / book_club_posts
 * check against (see schema files for the policy definitions).
 *
 * IMPORTANT — this only actually restricts anything if the role in
 * DATABASE_URL is NOT a superuser and does NOT have the BYPASSRLS
 * attribute. Postgres exempts superusers and BYPASSRLS roles from RLS
 * unconditionally, regardless of how the policies are written. Most
 * Neon/Replit-provisioned "default" connection strings use an owner-level
 * role that DOES bypass RLS. Run this once, connected as that role, to check:
 *
 *   SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;
 *
 * If rolsuper or rolbypassrls is true, RLS policies are silently a no-op
 * for this connection — see the README note in schema/rls-notes.md for how
 * to create a restricted application role.
 *
 * We use `set_config(...)` with a bound parameter (not string-interpolated
 * SQL) specifically so this can never become a SQL-injection vector itself
 * — `SET LOCAL app.current_user_id = '<value>'` cannot be parameterized
 * directly, but `set_config()` is a normal function call and accepts a
 * regular bound argument.
 *
 * `SET LOCAL` (which is what `is_local = true` gives us via set_config)
 * only lasts for the current transaction and is automatically reset when
 * it ends — never use `set_config(..., false)` here, since that would leak
 * one request's user id to whichever request reuses this pooled
 * connection next.
 */
export async function withUserContext<T>(
  userId: string,
  callback: (tx: typeof db) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
    return callback(tx as unknown as typeof db);
  });
}

export * from "./schema";

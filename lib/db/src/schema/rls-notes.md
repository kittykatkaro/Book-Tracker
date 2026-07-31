# Row-Level Security — deployment notes

This app now defines Postgres RLS policies on `books`, `book_clubs`,
`book_club_members`, `book_club_books`, and `book_club_posts` (see the
`pgPolicy(...)` calls in `books.ts` and `clubs.ts`). Read this before
assuming they're actually doing anything.

## The one thing that determines whether any of this works

Postgres **unconditionally exempts** two kinds of roles from every RLS
policy, no matter how the policies are written:

- Superuser roles
- Roles with the `BYPASSRLS` attribute

Most database-as-a-service providers (Neon, Replit's built-in Postgres,
Supabase's default connection, etc.) give you an **owner-level role** for
your main connection string, and owner-level roles are frequently also
exempted in practice depending on the provider. If that's what
`DATABASE_URL` points at, these policies will silently do nothing — every
query will behave exactly as it did before, with no errors, no warnings,
nothing. That's the dangerous failure mode: it looks like it's working
because nothing breaks, but nothing is actually being enforced either.

**Before relying on this, connect with `psql` (or your DB provider's SQL
console) using the exact role in your current `DATABASE_URL`, and run:**

```sql
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;
```

If either `rolsuper` or `rolbypassrls` is `true`, the policies below are
not being enforced for this connection. To actually enforce them, you'd
need to:

1. Create a separate, restricted role that owns no tables and has neither
   attribute:
   ```sql
   CREATE ROLE app_user LOGIN PASSWORD '...';
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
   ```
2. Point the app's `DATABASE_URL` at `app_user` instead of the owner role.
3. Since `app_user` won't own the tables, you don't need `FORCE ROW LEVEL
   SECURITY` (that setting only matters for a table's *owner* role — it's
   irrelevant for a non-owner role, which is already subject to RLS
   normally).

This is real infrastructure work with real risk (a misconfigured role can
lock the app out of its own data), so it's deliberately left as a manual
step rather than something automated here.

## How the session-scoped user id works

Every policy checks `current_setting('app.current_user_id', true)` against
the row's `user_id` (or a subquery involving `book_club_members`/
`book_clubs`). That setting is populated per-request by
`withUserContext()` in `lib/db/src/index.ts`, which wraps a callback in a
transaction and does:

```sql
SELECT set_config('app.current_user_id', $1, true);
```

`is_local = true` is what makes this `SET LOCAL`-equivalent — it only
applies for the current transaction and is automatically cleared when the
transaction ends. **Never change this to `false`** — since connections are
pooled and reused across different users' requests, a session-wide
`set_config` would leak one request's identity into whatever request
reuses that same pooled connection next.

## Current wiring status

`withUserContext()` is now used for every user-scoped query in
`routes/books.ts`, `routes/clubs.ts`, and `routes/import.ts` (including
the fire-and-forget background enrichment triggered from both `enrich-all`
and `import/confirm` — see `enrichBooksInBackground()` in `lib/enrich.ts`,
which now takes a `userId` and does its own `withUserContext`-wrapped
writes rather than using the plain `db` export). The public,
unauthenticated ISBN lookup routes (`/isbn-lookup`, `/isbn-bulk-lookup`)
intentionally don't use it — they don't touch any user-owned rows.

That means the RLS policies below will actually be exercised on every
request that touches user data, *provided* the connection role isn't
exempt (see the check above — that's still the one thing you need to
verify yourself, and still the only thing standing between "these
policies exist" and "these policies do anything").

## What already protects you regardless of RLS

Every route in this app already filters by `userId` at the application
level (e.g. `eq(booksTable.userId, userId)`), matching the actual Clerk
session on every request. RLS here is a **second, independent layer** —
useful in case an application-level check is ever missed in some future
code change, not a replacement for those checks. If the RLS policies turn
out to be a no-op for your current role, you are not currently exposed by
that alone; the application-level filtering is real and already correct.

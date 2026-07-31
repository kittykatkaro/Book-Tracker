import { pgTable, text, integer, timestamp, index, pgPolicy } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const booksTable = pgTable(
  "books",
  {
    id: text("id").primaryKey(),
    userId: text("user_id"),   // nullable for backward compat; all new books are scoped per-user
    title: text("title").notNull(),
    author: text("author").notNull(),
    coverColor: text("cover_color").notNull(),
    coverUrl: text("cover_url"),
    isbn: text("isbn"),
    status: text("status").notNull(), // 'reading' | 'read' | 'want_to_read'
    rating: integer("rating"),
    pages: integer("pages"),
    currentPage: integer("current_page"),
    notes: text("notes"),
    genre: text("genre"),
    dateAdded: timestamp("date_added", { withTimezone: true }).notNull().defaultNow(),
    dateStarted: timestamp("date_started", { withTimezone: true }),
    dateFinished: timestamp("date_finished", { withTimezone: true }),
  },
  (table) => [
    // Every list/stats query filters by user_id, often combined with a
    // status filter (e.g. the home feed's "reading" tab) — this single
    // composite index covers both the user_id-only and user_id+status cases.
    index("books_user_id_status_idx").on(table.userId, table.status),
    // ISBN duplicate-detection lookup (POST /api/books, import confirm).
    index("books_isbn_idx").on(table.isbn),

    // RLS: a book is only visible/writable by the user it belongs to.
    // Relies on app.current_user_id being set for the current transaction
    // — see withUserContext() in lib/db/src/index.ts. Legacy rows with a
    // NULL user_id are invisible under this policy (they already were,
    // in practice, since the app's own queries use a strict `=` filter
    // that never matches NULL either).
    pgPolicy("books_owner_policy", {
      for: "all",
      using: sql`${table.userId} = current_setting('app.current_user_id', true)`,
      withCheck: sql`${table.userId} = current_setting('app.current_user_id', true)`,
    }),
  ],
).enableRLS();

export const insertBookSchema = createInsertSchema(booksTable).omit({
  dateAdded: true,
});
export type InsertBook = z.infer<typeof insertBookSchema>;
export type BookRecord = typeof booksTable.$inferSelect;

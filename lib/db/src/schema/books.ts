import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const booksTable = pgTable("books", {
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
});

export const insertBookSchema = createInsertSchema(booksTable).omit({
  dateAdded: true,
});
export type InsertBook = z.infer<typeof insertBookSchema>;
export type BookRecord = typeof booksTable.$inferSelect;

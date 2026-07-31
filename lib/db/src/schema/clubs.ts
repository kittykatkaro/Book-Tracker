import { pgTable, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ---------------------------------------------------------------------------
// Book Clubs
// ---------------------------------------------------------------------------

export const bookClubsTable = pgTable("book_clubs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  ownerId: text("owner_id").notNull(),
  inviteCode: text("invite_code").notNull().unique(),
  /** SHA-256 hash of the club password; null means no password required */
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBookClubSchema = createInsertSchema(bookClubsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertBookClub = z.infer<typeof insertBookClubSchema>;
export type BookClubRecord = typeof bookClubsTable.$inferSelect;

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

export const bookClubMembersTable = pgTable("book_club_members", {
  id: text("id").primaryKey(),
  clubId: text("club_id").notNull().references(() => bookClubsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  displayName: text("display_name"),
  role: text("role").notNull().default("member"), // 'owner' | 'member'
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BookClubMemberRecord = typeof bookClubMembersTable.$inferSelect;

// ---------------------------------------------------------------------------
// Club Books (shared reading list, not tied to user's personal library)
// ---------------------------------------------------------------------------

export const bookClubBooksTable = pgTable("book_club_books", {
  id: text("id").primaryKey(),
  clubId: text("club_id").notNull().references(() => bookClubsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  author: text("author").notNull(),
  coverColor: text("cover_color").notNull(),
  isbn: text("isbn"),
  pages: integer("pages"),
  genre: text("genre"),
  addedBy: text("added_by").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BookClubBookRecord = typeof bookClubBooksTable.$inferSelect;

// ---------------------------------------------------------------------------
// Posts (comments + progress updates on a club book)
// ---------------------------------------------------------------------------

export const bookClubPostsTable = pgTable("book_club_posts", {
  id: text("id").primaryKey(),
  clubId: text("club_id").notNull().references(() => bookClubsTable.id, { onDelete: "cascade" }),
  clubBookId: text("club_book_id").notNull().references(() => bookClubBooksTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  userDisplayName: text("user_display_name"),
  content: text("content").notNull(),
  progressPage: integer("progress_page"), // optional progress share
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BookClubPostRecord = typeof bookClubPostsTable.$inferSelect;

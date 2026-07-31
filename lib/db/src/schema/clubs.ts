import { pgTable, text, integer, timestamp, boolean, index, pgPolicy } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ---------------------------------------------------------------------------
// Book Clubs
// ---------------------------------------------------------------------------

export const bookClubsTable = pgTable(
  "book_clubs",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    ownerId: text("owner_id").notNull(),
    inviteCode: text("invite_code").notNull().unique(),
    /** SHA-256 hash of the club password; null means no password required */
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // "Clubs I own" lookups (used for owner-only actions like delete/patch).
    index("book_clubs_owner_id_idx").on(table.ownerId),
    // inviteCode already has an implicit unique index from .unique() above.

    // RLS: any authenticated app user can read club rows — this matches
    // the app's actual existing access model (POST /clubs/join looks up
    // a club by invite code with no membership check at all; that's the
    // entire join mechanism). A member-only SELECT policy would break
    // joining, since a user isn't a member yet at the moment they're
    // trying to look up the club by its code. The invite code itself
    // (plus an optional password) is what actually gates access — not
    // row visibility. Only the owner can create/update/delete the row.
    pgPolicy("book_clubs_select_policy", {
      for: "select",
      using: sql`current_setting('app.current_user_id', true) <> ''`,
    }),
    pgPolicy("book_clubs_insert_policy", {
      for: "insert",
      withCheck: sql`${table.ownerId} = current_setting('app.current_user_id', true)`,
    }),
    pgPolicy("book_clubs_update_policy", {
      for: "update",
      using: sql`${table.ownerId} = current_setting('app.current_user_id', true)`,
      withCheck: sql`${table.ownerId} = current_setting('app.current_user_id', true)`,
    }),
    pgPolicy("book_clubs_delete_policy", {
      for: "delete",
      using: sql`${table.ownerId} = current_setting('app.current_user_id', true)`,
    }),
  ],
).enableRLS();

export const insertBookClubSchema = createInsertSchema(bookClubsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertBookClub = z.infer<typeof insertBookClubSchema>;
export type BookClubRecord = typeof bookClubsTable.$inferSelect;

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

export const bookClubMembersTable = pgTable(
  "book_club_members",
  {
    id: text("id").primaryKey(),
    clubId: text("club_id").notNull().references(() => bookClubsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    displayName: text("display_name"),
    role: text("role").notNull().default("member"), // 'owner' | 'member'
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Membership lookups are almost always "is this user a member of this
    // club" (clubId + userId together) or "list all members of this club"
    // (clubId alone) — this composite index covers both access patterns.
    index("club_members_club_id_user_id_idx").on(table.clubId, table.userId),
    // "Which clubs is this user in" (used to build the clubs list/home feed).
    index("club_members_user_id_idx").on(table.userId),

    // RLS — mirrors the real logic in routes/clubs.ts exactly:
    // - SELECT: any member of the same club can see its member list
    //   (a self-referential subquery — standard, supported RLS pattern).
    // - INSERT: a user can only create a membership row for themselves
    //   (covers both self-service join and the owner's own auto-join
    //   at club-creation time).
    // - DELETE: a member can remove their own row (leave), or the club
    //   owner can remove anyone else's (POST /:id/leave and
    //   DELETE /:id/members/:memberId respectively).
    // - No UPDATE policy: nothing in the app updates membership rows, so
    //   this is correctly denied by default once RLS is enabled.
    pgPolicy("club_members_select_policy", {
      for: "select",
      using: sql`${table.clubId} IN (
        SELECT club_id FROM book_club_members
        WHERE user_id = current_setting('app.current_user_id', true)
      )`,
    }),
    pgPolicy("club_members_insert_policy", {
      for: "insert",
      withCheck: sql`${table.userId} = current_setting('app.current_user_id', true)`,
    }),
    pgPolicy("club_members_delete_policy", {
      for: "delete",
      using: sql`${table.userId} = current_setting('app.current_user_id', true)
        OR ${table.clubId} IN (
          SELECT id FROM book_clubs
          WHERE owner_id = current_setting('app.current_user_id', true)
        )`,
    }),
  ],
).enableRLS();

export type BookClubMemberRecord = typeof bookClubMembersTable.$inferSelect;

// ---------------------------------------------------------------------------
// Club Books (shared reading list, not tied to user's personal library)
// ---------------------------------------------------------------------------

export const bookClubBooksTable = pgTable(
  "book_club_books",
  {
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
  },
  (table) => [
    // Every club-detail page load fetches this club's book list by club_id.
    index("club_books_club_id_idx").on(table.clubId),

    // RLS — SELECT/INSERT open to any member of the club; DELETE allowed
    // for whoever added the book, or the club owner (matches the exact
    // check in DELETE /:id/books/:bookId). No UPDATE policy: club books
    // aren't edited in place anywhere in the app.
    pgPolicy("club_books_select_policy", {
      for: "select",
      using: sql`${table.clubId} IN (
        SELECT club_id FROM book_club_members
        WHERE user_id = current_setting('app.current_user_id', true)
      )`,
    }),
    pgPolicy("club_books_insert_policy", {
      for: "insert",
      withCheck: sql`${table.clubId} IN (
        SELECT club_id FROM book_club_members
        WHERE user_id = current_setting('app.current_user_id', true)
      )`,
    }),
    pgPolicy("club_books_delete_policy", {
      for: "delete",
      using: sql`${table.addedBy} = current_setting('app.current_user_id', true)
        OR ${table.clubId} IN (
          SELECT id FROM book_clubs
          WHERE owner_id = current_setting('app.current_user_id', true)
        )`,
    }),
  ],
).enableRLS();

export type BookClubBookRecord = typeof bookClubBooksTable.$inferSelect;

// ---------------------------------------------------------------------------
// Posts (comments + progress updates on a club book)
// ---------------------------------------------------------------------------

export const bookClubPostsTable = pgTable(
  "book_club_posts",
  {
    id: text("id").primaryKey(),
    clubId: text("club_id").notNull().references(() => bookClubsTable.id, { onDelete: "cascade" }),
    clubBookId: text("club_book_id").notNull().references(() => bookClubBooksTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    userDisplayName: text("user_display_name"),
    content: text("content").notNull(),
    progressPage: integer("progress_page"), // optional progress share
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The book-detail discussion thread fetches posts by club_book_id.
    index("club_posts_club_book_id_idx").on(table.clubBookId),

    // RLS — SELECT/INSERT open to any member of the club; DELETE allowed
    // for the post's author or the club owner (matches the exact check
    // in DELETE /:id/books/:bookId/posts/:postId). No UPDATE policy:
    // posts aren't edited in place anywhere in the app.
    pgPolicy("club_posts_select_policy", {
      for: "select",
      using: sql`${table.clubId} IN (
        SELECT club_id FROM book_club_members
        WHERE user_id = current_setting('app.current_user_id', true)
      )`,
    }),
    pgPolicy("club_posts_insert_policy", {
      for: "insert",
      withCheck: sql`${table.clubId} IN (
        SELECT club_id FROM book_club_members
        WHERE user_id = current_setting('app.current_user_id', true)
      )`,
    }),
    pgPolicy("club_posts_delete_policy", {
      for: "delete",
      using: sql`${table.userId} = current_setting('app.current_user_id', true)
        OR ${table.clubId} IN (
          SELECT id FROM book_clubs
          WHERE owner_id = current_setting('app.current_user_id', true)
        )`,
    }),
  ],
).enableRLS();

export type BookClubPostRecord = typeof bookClubPostsTable.$inferSelect;

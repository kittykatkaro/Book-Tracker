import { Router, type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import {
  db,
  booksTable,
  bookClubsTable,
  bookClubMembersTable,
  bookClubPostsTable,
} from "@workspace/db";

const router = Router();

// ---------------------------------------------------------------------------
// Auth Middleware
// ---------------------------------------------------------------------------

interface AuthedRequest extends Request {
  userId: string;
}

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as AuthedRequest).userId = userId;
  next();
}

// ---------------------------------------------------------------------------
// DELETE /api/user/account
//
// Permanently deletes the authenticated user's data:
//   - every book in their personal library
//   - every club they own (which cascades — via FK onDelete: "cascade" — to
//     that club's members, shared books, and posts automatically)
//   - their membership in any club they don't own
//   - any posts they made in clubs owned by someone else
//
// This does NOT delete their Clerk auth identity — that's a separate
// concern the client can trigger afterward if desired.
//
// Requires an explicit `{ confirm: true }` body so a stray or mistaken
// call can't silently wipe an account.
// ---------------------------------------------------------------------------

router.delete("/account", requireAuth, async (req, res) => {
  const { userId } = req as AuthedRequest;
  const { confirm } = (req.body ?? {}) as { confirm?: boolean };

  if (confirm !== true) {
    return res.status(400).json({
      error: "Account deletion requires confirmation. Send { confirm: true } in the request body.",
    });
  }

  try {
    const result = await db.transaction(async (tx) => {
      // Clubs this user owns — deleting these cascades to that club's
      // members, shared books, and posts (all FK'd to book_clubs.id with
      // onDelete: "cascade"), so nothing further is needed for those rows.
      const deletedClubs = await tx
        .delete(bookClubsTable)
        .where(eq(bookClubsTable.ownerId, userId))
        .returning({ id: bookClubsTable.id });

      // Posts this user made in clubs they don't own (posts in clubs they
      // DO own were already removed by the cascade above).
      await tx.delete(bookClubPostsTable).where(eq(bookClubPostsTable.userId, userId));

      // Memberships in clubs owned by someone else (memberships in their
      // own now-deleted clubs were already removed by the cascade above).
      await tx.delete(bookClubMembersTable).where(eq(bookClubMembersTable.userId, userId));

      // Personal library.
      const deletedBooks = await tx
        .delete(booksTable)
        .where(eq(booksTable.userId, userId))
        .returning({ id: booksTable.id });

      return {
        booksDeleted: deletedBooks.length,
        clubsDeleted: deletedClubs.length,
      };
    });

    return res.status(200).json({
      message: "Account data deleted.",
      ...result,
    });
  } catch (err) {
    console.error(`[DELETE /api/user/account] Failed for user ${userId}:`, err);
    return res.status(500).json({ error: "Failed to delete account data" });
  }
});

export default router;

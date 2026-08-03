import { Router, type Request, type Response, type NextFunction } from "express";
import { eq, and, ne, asc } from "drizzle-orm";
import { getAuth, clerkClient } from "@clerk/express";
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
//   - every club they own:
//       - if the club has other members, ownership transfers to whoever has
//         been a member the longest (their role is bumped to "owner" and the
//         club's owner_id is repointed at them) — the club and its shared
//         books/posts survive intact for the remaining members
//       - if the user is the only member, the club is deleted outright,
//         which cascades — via FK onDelete: "cascade" — to that club's
//         members, shared books, and posts
//   - their membership in any club they don't own
//   - any posts they made (in clubs they own, owned, or don't own)
//   - their Clerk auth identity, deleted after the database cleanup commits
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
      const ownedClubs = await tx
        .select({ id: bookClubsTable.id })
        .from(bookClubsTable)
        .where(eq(bookClubsTable.ownerId, userId));

      let clubsTransferred = 0;
      let clubsDeleted = 0;

      for (const club of ownedClubs) {
        // Longest-standing member other than the owner being deleted — the
        // simplest, least-surprising successor to hand the club to.
        const [successor] = await tx
          .select({ userId: bookClubMembersTable.userId })
          .from(bookClubMembersTable)
          .where(and(eq(bookClubMembersTable.clubId, club.id), ne(bookClubMembersTable.userId, userId)))
          .orderBy(asc(bookClubMembersTable.joinedAt))
          .limit(1);

        if (successor) {
          await tx
            .update(bookClubsTable)
            .set({ ownerId: successor.userId, updatedAt: new Date() })
            .where(eq(bookClubsTable.id, club.id));

          await tx
            .update(bookClubMembersTable)
            .set({ role: "owner" })
            .where(and(eq(bookClubMembersTable.clubId, club.id), eq(bookClubMembersTable.userId, successor.userId)));

          clubsTransferred++;
        } else {
          // No one else left in the club — nothing to hand it off to.
          // Deleting cascades to members, shared books, and posts.
          await tx.delete(bookClubsTable).where(eq(bookClubsTable.id, club.id));
          clubsDeleted++;
        }
      }

      // Posts this user made anywhere, including in clubs they used to own
      // (those clubs may still exist post-transfer, so this isn't already
      // covered by a cascade).
      await tx.delete(bookClubPostsTable).where(eq(bookClubPostsTable.userId, userId));

      // This user's own membership rows — in clubs they don't own, and their
      // now-transferred former-owner row in clubs they used to own. (Rows in
      // clubs that got deleted above are already gone via cascade.)
      await tx.delete(bookClubMembersTable).where(eq(bookClubMembersTable.userId, userId));

      // Personal library.
      const deletedBooks = await tx
        .delete(booksTable)
        .where(eq(booksTable.userId, userId))
        .returning({ id: booksTable.id });

      return {
        booksDeleted: deletedBooks.length,
        clubsTransferred,
        clubsDeleted,
      };
    });

    // DB cleanup is committed at this point. Deleting the Clerk identity is
    // best-effort and reported separately so a Clerk-side hiccup doesn't
    // roll back — or hide — the data deletion that already succeeded.
    let clerkIdentityDeleted = false;
    try {
      await clerkClient.users.deleteUser(userId);
      clerkIdentityDeleted = true;
    } catch (clerkErr) {
      console.error(`[DELETE /api/user/account] Clerk identity deletion failed for user ${userId}:`, clerkErr);
    }

    return res.status(200).json({
      message: "Account data deleted.",
      ...result,
      clerkIdentityDeleted,
    });
  } catch (err) {
    console.error(`[DELETE /api/user/account] Failed for user ${userId}:`, err);
    return res.status(500).json({ error: "Failed to delete account data" });
  }
});

export default router;
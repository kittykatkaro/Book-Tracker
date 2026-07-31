import { Router, type Request, type Response, type NextFunction } from "express";
import { eq, desc, and, count } from "drizzle-orm";
import { createHash } from "crypto";
import { getAuth } from "@clerk/express";
import {
  bookClubsTable,
  bookClubMembersTable,
  bookClubBooksTable,
  bookClubPostsTable,
  withUserContext,
  type DbClient,
} from "@workspace/db";

const router = Router();

const COVER_COLORS = [
  "#2D6A4F", "#C8873F", "#5856D6", "#E55A4E", "#4A90D9",
  "#8B5CF6", "#D4792A", "#1D7A7A", "#B5451B", "#4C7B58",
];

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function randomColor(): string {
  return COVER_COLORS[Math.floor(Math.random() * COVER_COLORS.length)];
}

/** Hash a plain-text club password using SHA-256. */
function hashPassword(pw: string): string {
  return createHash("sha256").update(pw.trim()).digest("hex");
}

/** Strip the raw password hash from a club record and add `hasPassword`. */
function formatClub<T extends { password: string | null }>(
  club: T,
): Omit<T, "password"> & { hasPassword: boolean } {
  const { password, ...rest } = club;
  return { ...rest, hasPassword: !!password };
}

// ---------------------------------------------------------------------------
// Auth middleware
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

async function getMembership(client: DbClient, clubId: string, userId: string) {
  const [member] = await client
    .select()
    .from(bookClubMembersTable)
    .where(and(eq(bookClubMembersTable.clubId, clubId), eq(bookClubMembersTable.userId, userId)));
  return member ?? null;
}

// ---------------------------------------------------------------------------
// Clubs
// ---------------------------------------------------------------------------

// GET /api/clubs — clubs the user belongs to
router.get("/", requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthedRequest;

    const clubs = await withUserContext(userId, async (tx) => {
      const memberships = await tx
        .select()
        .from(bookClubMembersTable)
        .where(eq(bookClubMembersTable.userId, userId));

      if (memberships.length === 0) return [];

      return Promise.all(
        memberships.map(async (m) => {
          const [club] = await tx
            .select()
            .from(bookClubsTable)
            .where(eq(bookClubsTable.id, m.clubId));
          if (!club) return null;

          const [{ count: memberCount }] = await tx
            .select({ count: count() })
            .from(bookClubMembersTable)
            .where(eq(bookClubMembersTable.clubId, m.clubId));

          const [{ count: bookCount }] = await tx
            .select({ count: count() })
            .from(bookClubBooksTable)
            .where(eq(bookClubBooksTable.clubId, m.clubId));

          const [latestBook] = await tx
            .select()
            .from(bookClubBooksTable)
            .where(eq(bookClubBooksTable.clubId, m.clubId))
            .orderBy(desc(bookClubBooksTable.createdAt))
            .limit(1);

          return {
            ...formatClub(club),
            memberCount: Number(memberCount),
            bookCount: Number(bookCount),
            latestBook: latestBook ?? null,
            myRole: m.role,
          };
        }),
      );
    });

    return res.json(clubs.filter(Boolean));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch clubs" });
  }
});

// POST /api/clubs — create club
router.post("/", requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthedRequest;
    const { name, description, displayName, password } = req.body as {
      name: string;
      description?: string;
      displayName?: string;
      password?: string;
    };

    if (!name?.trim()) return res.status(400).json({ error: "name is required" });
    if (!password?.trim()) return res.status(400).json({ error: "password is required" });

    const clubId = generateId();
    const now = new Date();
    const passwordHash = hashPassword(password);

    const club = await withUserContext(userId, async (tx) => {
      const [club] = await tx
        .insert(bookClubsTable)
        .values({
          id: clubId,
          name: name.trim(),
          description: description?.trim() ?? null,
          ownerId: userId,
          inviteCode: generateInviteCode(),
          password: passwordHash,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      await tx.insert(bookClubMembersTable).values({
        id: generateId(),
        clubId,
        userId,
        displayName: displayName?.trim() ?? null,
        role: "owner",
        joinedAt: now,
      });

      return club;
    });

    return res.status(201).json({
      ...formatClub(club),
      memberCount: 1,
      bookCount: 0,
      latestBook: null,
      myRole: "owner",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to create club" });
  }
});

// POST /api/clubs/join — join by invite code (before /:id)
router.post("/join", requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthedRequest;
    const { inviteCode, displayName, password } = req.body as {
      inviteCode: string;
      displayName?: string;
      password?: string;
    };

    if (!inviteCode?.trim()) return res.status(400).json({ error: "inviteCode is required" });

    const result = await withUserContext(userId, async (tx) => {
      const [club] = await tx
        .select()
        .from(bookClubsTable)
        .where(eq(bookClubsTable.inviteCode, inviteCode.trim().toUpperCase()));

      if (!club) return { status: 404, error: "Invalid invite code" } as const;

      // Password check — only if the club has one
      if (club.password) {
        if (!password?.trim()) {
          return { status: 403, error: "This club requires a password", code: "password_required" } as const;
        }
        if (hashPassword(password) !== club.password) {
          return { status: 403, error: "Incorrect password", code: "wrong_password" } as const;
        }
      }

      const existing = await getMembership(tx, club.id, userId);
      if (existing) return { status: 409, error: "Already a member" } as const;

      await tx.insert(bookClubMembersTable).values({
        id: generateId(),
        clubId: club.id,
        userId,
        displayName: displayName?.trim() ?? null,
        role: "member",
        joinedAt: new Date(),
      });

      return { status: 200, club } as const;
    });

    if (result.status !== 200) {
      const { status, club: _club, ...body } = result as any;
      return res.status(status).json(body);
    }

    return res.status(200).json({ club: formatClub(result.club) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to join club" });
  }
});

// GET /api/clubs/:id
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthedRequest;
    const { id } = req.params;

    const result = await withUserContext(userId, async (tx) => {
      const membership = await getMembership(tx, id, userId);
      if (!membership) return { status: 403, error: "Not a member" } as const;

      const [club] = await tx.select().from(bookClubsTable).where(eq(bookClubsTable.id, id));
      if (!club) return { status: 404, error: "Not found" } as const;

      const members = await tx
        .select()
        .from(bookClubMembersTable)
        .where(eq(bookClubMembersTable.clubId, id))
        .orderBy(bookClubMembersTable.joinedAt);

      const books = await tx
        .select()
        .from(bookClubBooksTable)
        .where(eq(bookClubBooksTable.clubId, id))
        .orderBy(desc(bookClubBooksTable.createdAt));

      const booksWithCounts = await Promise.all(
        books.map(async (book) => {
          const [{ count: postCount }] = await tx
            .select({ count: count() })
            .from(bookClubPostsTable)
            .where(eq(bookClubPostsTable.clubBookId, book.id));
          return { ...book, postCount: Number(postCount) };
        }),
      );

      return {
        status: 200,
        payload: {
          ...formatClub(club),
          members,
          books: booksWithCounts,
          myRole: membership.role,
        },
      } as const;
    });

    if (result.status !== 200) {
      const { status, ...body } = result;
      return res.status(status).json(body);
    }

    return res.json(result.payload);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch club" });
  }
});

// PATCH /api/clubs/:id (owner only)
router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthedRequest;
    const { id } = req.params;
    const { name, description, password } = req.body as {
      name?: string;
      description?: string;
      /** Empty string removes the password; undefined leaves it unchanged */
      password?: string;
    };

    const result = await withUserContext(userId, async (tx) => {
      const [club] = await tx.select().from(bookClubsTable).where(eq(bookClubsTable.id, id));
      if (!club) return { status: 404, error: "Not found" } as const;
      if (club.ownerId !== userId) return { status: 403, error: "Owner only" } as const;

      const updates: Partial<typeof bookClubsTable.$inferInsert> = { updatedAt: new Date() };
      if (name !== undefined) updates.name = name.trim();
      if (description !== undefined) updates.description = description.trim() || null;
      if (password !== undefined) {
        updates.password = password.trim() ? hashPassword(password) : null;
      }

      const [updated] = await tx
        .update(bookClubsTable)
        .set(updates)
        .where(eq(bookClubsTable.id, id))
        .returning();

      return { status: 200, club: updated } as const;
    });

    if (result.status !== 200) {
      const { status, club: _club, ...body } = result as any;
      return res.status(status).json(body);
    }

    return res.json(formatClub(result.club));
  } catch (err) {
    return res.status(500).json({ error: "Failed to update club" });
  }
});

// DELETE /api/clubs/:id (owner only)
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthedRequest;
    const { id } = req.params;

    const result = await withUserContext(userId, async (tx) => {
      const [club] = await tx.select().from(bookClubsTable).where(eq(bookClubsTable.id, id));
      if (!club) return { status: 404, error: "Not found" } as const;
      if (club.ownerId !== userId) return { status: 403, error: "Owner only" } as const;

      await tx.delete(bookClubsTable).where(eq(bookClubsTable.id, id));
      return { status: 204 } as const;
    });

    if (result.status !== 204) {
      const { status, ...body } = result;
      return res.status(status).json(body);
    }
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ error: "Failed to delete club" });
  }
});

// POST /api/clubs/:id/leave
router.post("/:id/leave", requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthedRequest;
    const { id } = req.params;

    const result = await withUserContext(userId, async (tx) => {
      const [club] = await tx.select().from(bookClubsTable).where(eq(bookClubsTable.id, id));
      if (!club) return { status: 404, error: "Not found" } as const;
      if (club.ownerId === userId)
        return { status: 400, error: "Owner cannot leave — delete the club instead" } as const;

      const membership = await getMembership(tx, id, userId);
      if (!membership) return { status: 404, error: "Not a member" } as const;

      await tx
        .delete(bookClubMembersTable)
        .where(and(eq(bookClubMembersTable.clubId, id), eq(bookClubMembersTable.userId, userId)));
      return { status: 204 } as const;
    });

    if (result.status !== 204) {
      const { status, ...body } = result;
      return res.status(status).json(body);
    }
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ error: "Failed to leave club" });
  }
});

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

// DELETE /api/clubs/:id/members/:memberId (owner only)
router.delete("/:id/members/:memberId", requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthedRequest;
    const { id, memberId } = req.params;

    const result = await withUserContext(userId, async (tx) => {
      const [club] = await tx.select().from(bookClubsTable).where(eq(bookClubsTable.id, id));
      if (!club) return { status: 404, error: "Not found" } as const;
      if (club.ownerId !== userId) return { status: 403, error: "Owner only" } as const;
      if (memberId === userId) return { status: 400, error: "Cannot remove yourself" } as const;

      await tx
        .delete(bookClubMembersTable)
        .where(
          and(eq(bookClubMembersTable.clubId, id), eq(bookClubMembersTable.userId, memberId)),
        );
      return { status: 204 } as const;
    });

    if (result.status !== 204) {
      const { status, ...body } = result;
      return res.status(status).json(body);
    }
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ error: "Failed to remove member" });
  }
});

// ---------------------------------------------------------------------------
// Club Books
// ---------------------------------------------------------------------------

// POST /api/clubs/:id/books
router.post("/:id/books", requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthedRequest;
    const { id } = req.params;
    const { title, author, isbn, pages, genre } = req.body as {
      title: string;
      author: string;
      isbn?: string;
      pages?: number;
      genre?: string;
    };

    if (!title?.trim() || !author?.trim())
      return res.status(400).json({ error: "title and author are required" });

    const result = await withUserContext(userId, async (tx) => {
      const membership = await getMembership(tx, id, userId);
      if (!membership) return { status: 403, error: "Not a member" } as const;

      const [book] = await tx
        .insert(bookClubBooksTable)
        .values({
          id: generateId(),
          clubId: id,
          title: title.trim(),
          author: author.trim(),
          coverColor: randomColor(),
          isbn: isbn ?? null,
          pages: pages ?? null,
          genre: genre ?? null,
          addedBy: userId,
          isActive: true,
          createdAt: new Date(),
        })
        .returning();

      return { status: 201, book } as const;
    });

    if (result.status !== 201) {
      const { status, ...body } = result;
      return res.status(status).json(body);
    }

    return res.status(201).json({ ...result.book, postCount: 0 });
  } catch (err) {
    return res.status(500).json({ error: "Failed to add book" });
  }
});

// DELETE /api/clubs/:id/books/:bookId (owner or adder)
router.delete("/:id/books/:bookId", requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthedRequest;
    const { id, bookId } = req.params;

    const result = await withUserContext(userId, async (tx) => {
      const [club] = await tx.select().from(bookClubsTable).where(eq(bookClubsTable.id, id));
      if (!club) return { status: 404, error: "Not found" } as const;

      const [book] = await tx
        .select()
        .from(bookClubBooksTable)
        .where(and(eq(bookClubBooksTable.id, bookId), eq(bookClubBooksTable.clubId, id)));
      if (!book) return { status: 404, error: "Book not found" } as const;

      if (club.ownerId !== userId && book.addedBy !== userId)
        return { status: 403, error: "Not allowed" } as const;

      await tx.delete(bookClubBooksTable).where(eq(bookClubBooksTable.id, bookId));
      return { status: 204 } as const;
    });

    if (result.status !== 204) {
      const { status, ...body } = result;
      return res.status(status).json(body);
    }
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ error: "Failed to remove book" });
  }
});

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

// GET /api/clubs/:id/books/:bookId/posts
router.get("/:id/books/:bookId/posts", requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthedRequest;
    const { id, bookId } = req.params;

    const result = await withUserContext(userId, async (tx) => {
      const membership = await getMembership(tx, id, userId);
      if (!membership) return { status: 403, error: "Not a member" } as const;

      const posts = await tx
        .select()
        .from(bookClubPostsTable)
        .where(
          and(
            eq(bookClubPostsTable.clubId, id),
            eq(bookClubPostsTable.clubBookId, bookId),
          ),
        )
        .orderBy(desc(bookClubPostsTable.createdAt));

      return { status: 200, posts } as const;
    });

    if (result.status !== 200) {
      const { status, ...body } = result;
      return res.status(status).json(body);
    }

    return res.json(result.posts);
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch posts" });
  }
});

// POST /api/clubs/:id/books/:bookId/posts
router.post("/:id/books/:bookId/posts", requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthedRequest;
    const { id, bookId } = req.params;
    const { content, progressPage, displayName } = req.body as {
      content: string;
      progressPage?: number;
      displayName?: string;
    };
    if (!content?.trim()) return res.status(400).json({ error: "content is required" });

    const result = await withUserContext(userId, async (tx) => {
      const membership = await getMembership(tx, id, userId);
      if (!membership) return { status: 403, error: "Not a member" } as const;

      const [book] = await tx
        .select()
        .from(bookClubBooksTable)
        .where(and(eq(bookClubBooksTable.id, bookId), eq(bookClubBooksTable.clubId, id)));
      if (!book) return { status: 404, error: "Book not found" } as const;

      const [post] = await tx
        .insert(bookClubPostsTable)
        .values({
          id: generateId(),
          clubId: id,
          clubBookId: bookId,
          userId,
          userDisplayName: displayName?.trim() ?? membership.displayName ?? null,
          content: content.trim(),
          progressPage: progressPage ?? null,
          createdAt: new Date(),
        })
        .returning();

      return { status: 201, post } as const;
    });

    if (result.status !== 201) {
      const { status, ...body } = result;
      return res.status(status).json(body);
    }

    return res.status(201).json(result.post);
  } catch (err) {
    return res.status(500).json({ error: "Failed to add post" });
  }
});

// DELETE /api/clubs/:id/books/:bookId/posts/:postId (author or club owner)
router.delete("/:id/books/:bookId/posts/:postId", requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthedRequest;
    const { id, postId } = req.params;

    const result = await withUserContext(userId, async (tx) => {
      const [club] = await tx.select().from(bookClubsTable).where(eq(bookClubsTable.id, id));
      if (!club) return { status: 404, error: "Not found" } as const;

      const [post] = await tx
        .select()
        .from(bookClubPostsTable)
        .where(eq(bookClubPostsTable.id, postId));
      if (!post) return { status: 404, error: "Post not found" } as const;

      if (post.userId !== userId && club.ownerId !== userId)
        return { status: 403, error: "Not allowed" } as const;

      await tx.delete(bookClubPostsTable).where(eq(bookClubPostsTable.id, postId));
      return { status: 204 } as const;
    });

    if (result.status !== 204) {
      const { status, ...body } = result;
      return res.status(status).json(body);
    }
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ error: "Failed to delete post" });
  }
});

export default router;

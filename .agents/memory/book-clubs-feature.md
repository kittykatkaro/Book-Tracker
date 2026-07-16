---
name: Book clubs feature
description: Implementation details and decisions for the book club feature across DB, API, web, and mobile.
---

## Schema (lib/db/src/schema/clubs.ts)
Four tables: `book_clubs`, `book_club_members`, `book_club_books`, `book_club_posts`. All export from `lib/db/src/schema/index.ts`. DB migration run via `pnpm run push` from `lib/db/`.

## API (artifacts/api-server/src/routes/clubs.ts)
Mounted at `/api/clubs` in `routes/index.ts`. Key endpoints:
- `GET /api/clubs` — user's clubs
- `POST /api/clubs` — create (adds owner as member automatically)
- `POST /api/clubs/join` — join by invite code (must be defined BEFORE `/:id`)
- `GET /api/clubs/:id` — detail with members + books + post counts
- `POST /api/clubs/:id/leave` / `DELETE /api/clubs/:id` — leave/delete
- `POST /api/clubs/:id/books` — add book (any member)
- `DELETE /api/clubs/:id/books/:bookId` — remove (owner or adder)
- `GET/POST /api/clubs/:id/books/:bookId/posts` — discussion posts
- `DELETE /api/clubs/:id/books/:bookId/posts/:postId` — delete (author or owner)

**Invite code:** 8-char alphanumeric, generated server-side, stored on club.
**Display names:** stored at join time in `book_club_members.display_name`; client passes `displayName` in POST body for posts/join/create.

## customFetch export
`customFetch` must be exported from `lib/api-client-react/src/index.ts` so web and mobile pages can `import { customFetch } from "@workspace/api-client-react"`. The `./src/custom-fetch` subpath is NOT in package.json exports — always use the main package.

**Why:** Vite enforces package `exports` map; direct src imports cause `Missing specifier` errors.

## Web (artifacts/booktracker-web)
- `/clubs` → `<Clubs>` page — lists clubs, create/join dialogs
- `/clubs/:id` → `<ClubDetail>` page — books + discussions + members panel
- `layout.tsx` — added "Clubs" nav link (desktop + mobile bottom nav)
- Uses TanStack Query + `customFetch` directly (no generated hooks for clubs)

## Mobile (artifacts/booktracker)
- `app/(tabs)/clubs.tsx` — clubs list tab screen
- `app/club/[id].tsx` — club detail with Books/Members tabs; tapping a book opens a full-screen posts modal with chat-style compose input
- `app/(tabs)/_layout.tsx` — added clubs tab (SF Symbol `person.3` on iOS, Feather `users` on Android)
- `expo-clipboard` installed for invite code copy on mobile

**How to apply:** When extending clubs (e.g. adding reactions, notifications), follow the same customFetch pattern and add routes to `artifacts/api-server/src/routes/clubs.ts`.

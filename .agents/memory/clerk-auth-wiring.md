---
name: Clerk auth wiring
description: How Clerk auth is wired across the monorepo (api-server, booktracker-web, booktracker Expo)
---

## Setup completed
- Clerk provisioned via `setupClerkWhitelabelAuth()` — keys in env secrets (CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, VITE_CLERK_PUBLISHABLE_KEY)
- `booksTable` has nullable `user_id` column; all book queries scoped to `userId` via `requireAuth` middleware

## API server (`artifacts/api-server`)
- `@clerk/express`, `@clerk/shared`, `http-proxy-middleware` installed
- `clerkProxyMiddleware` mounted at `CLERK_PROXY_PATH` (before body parsers)
- `cors({ credentials: true, origin: true })` required for browser auth cookies
- `clerkMiddleware` resolves publishableKey from request host via `publishableKeyFromHost`
- `requireAuth` in `routes/books.ts` reads `getAuth(req).userId`; isbn-lookup is public (no auth)

## Web (`artifacts/booktracker-web`)
- `@clerk/react`, `@clerk/themes` installed
- `App.tsx`: WouterRouter → ClerkProvider → QueryClientProvider; `ClerkProvider` must be inside `WouterRouter` to access `useLocation` for `routerPush`/`routerReplace`
- `@layer theme, base, clerk, components, utilities;` added before `@import 'tailwindcss'` in index.css
- `tailwindcss({ optimize: false })` in vite.config.ts (required for Clerk CSS layer)
- `/` shows landing to signed-out users, library to signed-in (no redirect needed)
- `/sign-in/*?` and `/sign-up/*?` routes use Clerk built-in `<SignIn>` and `<SignUp>` components
- `ClerkQueryClientCacheInvalidator` clears TanStack Query cache on user change

## Expo (`artifacts/booktracker`)
- `@clerk/expo`, `expo-secure-store@~15.0.8`, `expo-crypto@~15.0.8`, `expo-auth-session@~7.0.10` installed
- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=$CLERK_PUBLISHABLE_KEY` prepended to dev script
- Root `_layout.tsx`: ClerkProvider (with tokenCache) wraps everything; `ClerkLoaded` prevents flash
- `InitialLayout` component: useEffect routes between `(auth)` and `(tabs)` based on `isSignedIn`
- `setAuthTokenGetter(() => getToken())` called whenever `isSignedIn` changes (attaches Bearer token)
- `(auth)/sign-in.tsx` and `(auth)/sign-up.tsx` use `useSignIn`/`useSignUp` Clerk Core v3 hooks
- Sign-up collects username, full name, email, password; email verification step built in

## Important: username/name fields at sign-up
The mobile custom screens collect username + name and pass them to `signUp.password()`.
For the WEB `<SignUp>` component to show these fields, the user must enable them in the Clerk Auth pane (username toggle, name fields toggle). Without enabling, only email+password appear.

**Why:** Replit-managed Clerk tenant configuration is done through the Auth pane, not programmatically.

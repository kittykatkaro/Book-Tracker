---
name: Dark mode implementation
description: How light/dark/system themes are wired in the web and Expo apps, including the Clerk appearance fix.
---

Web app (`artifacts/booktracker-web`)
- Uses `next-themes` with `attribute="class"` and `defaultTheme="system"`.
- `ThemeProvider` wraps `WouterRouter`; `ThemeToggle` and `Settings` call `useTheme` from `next-themes`.
- Clerk appearance is built dynamically via `getClerkAppearance(isDark)` so the sign-in/sign-up cards stay readable in dark mode.

Expo app (`artifacts/booktracker`)
- Uses a custom `ThemeContext` at `context/ThemeContext.tsx` storing the user's preference (`light`/`dark`/`system`) in AsyncStorage and falling back to `useColorScheme()`.
- `useColors` resolves the active palette from `ThemeContext` instead of directly from `useColorScheme`.
- Theme toggle is added to the mobile Settings screen alongside the language toggle.

Both apps
- Dark palette mirrors the web CSS variables into the mobile `constants/colors.ts` dark palette.
- All new UI strings are translated in EN/DE locale files.

**Why:** A shared theme concept across both apps keeps the brand palette consistent, while the platform-specific providers match each framework's conventions (next-themes for web, React Context + AsyncStorage for Expo).

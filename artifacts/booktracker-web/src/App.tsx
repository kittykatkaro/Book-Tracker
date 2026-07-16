import { useEffect, useRef } from "react";
import {
  ClerkProvider, SignIn, SignUp, Show, useClerk, useUser,
} from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { useTheme } from "next-themes";
import { Switch, Route, useLocation, Redirect, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { Layout } from "@/components/layout";
import { Library } from "@/pages/library";
import { AddBook } from "@/pages/add-book";
import { BookDetail } from "@/pages/book-detail";
import { Stats } from "@/pages/stats";
import { Clubs } from "@/pages/clubs";
import { ClubDetail } from "@/pages/club-detail";
import { Settings } from "@/pages/settings";
import NotFound from "@/pages/not-found";

// ---------------------------------------------------------------------------
// Clerk setup — copy verbatim (canonical wiring, do not alter)
// ---------------------------------------------------------------------------

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

if (!clerkPubKey) throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");

// Empty in dev (intentional); auto-populated in prod. Do NOT gate on NODE_ENV.
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

// ---------------------------------------------------------------------------
// Appearance — warm literary palette
// ---------------------------------------------------------------------------

function getClerkAppearance(isDark: boolean) {
  const p = isDark
    ? {
        primary: "hsl(152, 39%, 52%)",
        foreground: "hsl(240, 14%, 96%)",
        mutedForeground: "hsl(240, 1%, 57%)",
        background: "hsl(240, 2%, 11%)",
        inputBg: "hsl(240, 2%, 18%)",
        border: "hsl(240, 1%, 22%)",
        neutral: "hsl(240, 1%, 57%)",
      }
    : {
        primary: "hsl(152, 39%, 30%)",
        foreground: "hsl(30, 15%, 15%)",
        mutedForeground: "hsl(30, 8%, 50%)",
        background: "hsl(36, 40%, 95%)",
        inputBg: "#ffffff",
        border: "hsl(30, 12%, 72%)",
        neutral: "hsl(30, 12%, 72%)",
      };

  return {
    theme: shadcn,
    cssLayerName: "clerk" as const,
    options: {
      logoPlacement: "inside" as const,
      logoLinkUrl: basePath || "/",
      logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
    },
    variables: {
      colorPrimary: p.primary,
      colorForeground: p.foreground,
      colorMutedForeground: p.mutedForeground,
      colorDanger: "hsl(0, 72%, 51%)",
      colorBackground: p.background,
      colorInput: p.inputBg,
      colorInputForeground: p.foreground,
      colorNeutral: p.neutral,
      fontFamily: "'Inter', sans-serif",
      borderRadius: "0.75rem",
    },
    elements: {
      rootBox: "w-full flex justify-center",
      cardBox: `rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl shadow-black/8 ${isDark ? "bg-[hsl(240,2%,11%)]" : "bg-[hsl(36,40%,95%)]"}`,
      card: "!shadow-none !border-0 !bg-transparent !rounded-none",
      footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
      headerTitle: `font-serif text-2xl ${isDark ? "text-[hsl(240,14%,96%)]" : "text-[hsl(30,15%,15%)]"}`,
      headerSubtitle: `text-sm ${isDark ? "text-[hsl(240,1%,57%)]" : "text-[hsl(30,8%,50%)]"}`,
      socialButtonsBlockButtonText: `font-medium ${isDark ? "text-[hsl(240,14%,96%)]" : "text-[hsl(30,15%,15%)]"}`,
      formFieldLabel: `font-medium text-sm ${isDark ? "text-[hsl(240,14%,96%)]" : "text-[hsl(30,15%,15%)]"}`,
      footerActionLink: `font-semibold ${isDark ? "text-[hsl(152,39%,52%)] hover:text-[hsl(152,39%,60%)]" : "text-[hsl(152,39%,30%)] hover:text-[hsl(152,39%,20%)]"}`,
      footerActionText: isDark ? "text-[hsl(240,1%,57%)]" : "text-[hsl(30,8%,50%)]",
      dividerText: `text-xs ${isDark ? "text-[hsl(240,1%,57%)]" : "text-[hsl(30,8%,50%)]"}`,
      identityPreviewEditButton: isDark ? "text-[hsl(152,39%,52%)]" : "text-[hsl(152,39%,30%)]",
      formFieldSuccessText: isDark ? "text-[hsl(152,39%,52%)]" : "text-[hsl(152,39%,30%)]",
      alertText: isDark ? "text-[hsl(240,14%,96%)]" : "text-[hsl(30,15%,15%)]",
      logoBox: "justify-center pt-2",
      logoImage: "h-10 w-10",
      socialButtonsBlockButton: `border transition-colors ${isDark ? "border-[hsl(240,1%,22%)] bg-[hsl(240,2%,18%)] hover:bg-[hsl(240,2%,25%)]" : "border-[hsl(30,12%,72%)] bg-white hover:bg-[hsl(36,30%,90%)]"}`,
      formButtonPrimary: `font-semibold rounded-full transition-colors ${isDark ? "bg-[hsl(152,39%,52%)] hover:bg-[hsl(152,39%,60%)] text-[hsl(240,2%,11%)]" : "bg-[hsl(152,39%,30%)] hover:bg-[hsl(152,39%,22%)] text-white"}`,
      formFieldInput: `rounded-lg border ${isDark ? "bg-[hsl(240,2%,18%)] border-[hsl(240,1%,22%)] text-[hsl(240,14%,96%)]" : "bg-white border-[hsl(30,12%,72%)] text-[hsl(30,15%,15%)]"}`,
      footerAction: `border-t ${isDark ? "border-[hsl(240,1%,22%)]/40" : "border-[hsl(30,12%,72%)]/40"}`,
      dividerLine: isDark ? "bg-[hsl(240,1%,22%)]/40" : "bg-[hsl(30,12%,72%)]/40",
      alert: "border rounded-lg border-[hsl(0,72%,51%)]/20 bg-[hsl(0,72%,51%)]/5",
      otpCodeFieldInput: `rounded-lg border ${isDark ? "bg-[hsl(240,2%,18%)] border-[hsl(240,1%,22%)] text-[hsl(240,14%,96%)]" : "bg-white border-[hsl(30,12%,72%)] text-[hsl(30,15%,15%)]"}`,
      formFieldRow: "",
      main: "",
    },
  };
}

// ---------------------------------------------------------------------------
// Query client
// ---------------------------------------------------------------------------

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 2 } },
});

// ---------------------------------------------------------------------------
// Auth pages
// ---------------------------------------------------------------------------

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-12">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
      />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-12">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Landing page (shown to signed-out visitors at /)
// ---------------------------------------------------------------------------

function LandingPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background text-center px-6">
      <div className="mb-10 space-y-4">
        <div className="mx-auto w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
          <img src={`${basePath}/logo.svg`} alt="Library" className="w-12 h-12" />
        </div>
        <h1 className="font-serif text-5xl font-bold text-primary tracking-tight">Library</h1>
        <p className="text-muted-foreground text-lg max-w-xs mx-auto leading-relaxed">
          Your personal reading journal. Track every book you love.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <a
          href={`${basePath}/sign-up`}
          className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-8 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
          data-testid="link-get-started"
        >
          Get started — it's free
        </a>
        <a
          href={`${basePath}/sign-in`}
          className="inline-flex h-11 items-center justify-center rounded-full border border-border px-8 text-sm font-medium hover:bg-secondary transition-colors"
          data-testid="link-sign-in"
        >
          Sign in
        </a>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Route guards
// ---------------------------------------------------------------------------

/** / — shows Library to signed-in users, landing page to signed-out users */
function HomeRoute() {
  return (
    <>
      <Show when="signed-in">
        <Layout>
          <Library />
        </Layout>
      </Show>
      <Show when="signed-out">
        <LandingPage />
      </Show>
    </>
  );
}

/** Any protected page — redirects to / (landing) if not signed-in */
function ProtectedPage({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Show when="signed-in">
        <Layout>{children}</Layout>
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

// ---------------------------------------------------------------------------
// Cache invalidation on user change
// ---------------------------------------------------------------------------

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsub = addListener(({ user }) => {
      const id = user?.id ?? null;
      if (prevRef.current !== undefined && prevRef.current !== id) qc.clear();
      prevRef.current = id;
    });
    return unsub;
  }, [addListener, qc]);

  return null;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomeRoute} />

      {/* REQUIRED — copy "/sign-in/*?" and "/sign-up/*?" verbatim */}
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />

      <Route path="/add">
        <ProtectedPage><AddBook /></ProtectedPage>
      </Route>
      <Route path="/book/:id">
        {() => <ProtectedPage><BookDetail /></ProtectedPage>}
      </Route>
      <Route path="/stats">
        <ProtectedPage><Stats /></ProtectedPage>
      </Route>
      <Route path="/clubs">
        <ProtectedPage><Clubs /></ProtectedPage>
      </Route>
      <Route path="/clubs/:id">
        {() => <ProtectedPage><ClubDetail /></ProtectedPage>}
      </Route>
      <Route path="/settings">
        <ProtectedPage><Settings /></ProtectedPage>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={getClerkAppearance(isDark)}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Welcome back",
            subtitle: "Sign in to your reading journal",
          },
        },
        signUp: {
          start: {
            title: "Start your library",
            subtitle: "Create an account to track your books",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ClerkQueryClientCacheInvalidator />
          <Router />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <WouterRouter base={basePath}>
        <ClerkProviderWithRoutes />
      </WouterRouter>
    </ThemeProvider>
  );
}

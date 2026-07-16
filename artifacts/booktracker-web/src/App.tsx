import { useEffect, useRef } from "react";
import {
  ClerkProvider, SignIn, SignUp, Show, useClerk, useUser,
} from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Switch, Route, useLocation, Redirect, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Layout } from "@/components/layout";
import { Library } from "@/pages/library";
import { AddBook } from "@/pages/add-book";
import { BookDetail } from "@/pages/book-detail";
import { Stats } from "@/pages/stats";
import { Clubs } from "@/pages/clubs";
import { ClubDetail } from "@/pages/club-detail";
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

const appearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(152, 39%, 30%)",
    colorForeground: "hsl(30, 15%, 15%)",
    colorMutedForeground: "hsl(30, 8%, 50%)",
    colorDanger: "hsl(0, 72%, 51%)",
    colorBackground: "hsl(36, 40%, 95%)",
    colorInput: "#ffffff",
    colorInputForeground: "hsl(30, 15%, 15%)",
    colorNeutral: "hsl(30, 12%, 72%)",
    fontFamily: "'Inter', sans-serif",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[hsl(36,40%,95%)] rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl shadow-black/8",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "font-serif text-[hsl(30,15%,15%)] text-2xl",
    headerSubtitle: "text-[hsl(30,8%,50%)] text-sm",
    socialButtonsBlockButtonText: "text-[hsl(30,15%,15%)] font-medium",
    formFieldLabel: "text-[hsl(30,15%,15%)] font-medium text-sm",
    footerActionLink: "text-[hsl(152,39%,30%)] font-semibold hover:text-[hsl(152,39%,20%)]",
    footerActionText: "text-[hsl(30,8%,50%)]",
    dividerText: "text-[hsl(30,8%,50%)] text-xs",
    identityPreviewEditButton: "text-[hsl(152,39%,30%)]",
    formFieldSuccessText: "text-[hsl(152,39%,30%)]",
    alertText: "text-[hsl(30,15%,15%)]",
    logoBox: "justify-center pt-2",
    logoImage: "h-10 w-10",
    socialButtonsBlockButton: "border border-[hsl(30,12%,72%)] bg-white hover:bg-[hsl(36,30%,90%)] transition-colors",
    formButtonPrimary: "bg-[hsl(152,39%,30%)] hover:bg-[hsl(152,39%,22%)] text-white font-semibold rounded-full transition-colors",
    formFieldInput: "bg-white border border-[hsl(30,12%,72%)] text-[hsl(30,15%,15%)] rounded-lg",
    footerAction: "border-t border-[hsl(30,12%,72%)]/40",
    dividerLine: "bg-[hsl(30,12%,72%)]/40",
    alert: "border border-[hsl(0,72%,51%)]/20 bg-[hsl(0,72%,51%)]/5 rounded-lg",
    otpCodeFieldInput: "border border-[hsl(30,12%,72%)] bg-white rounded-lg text-[hsl(30,15%,15%)]",
    formFieldRow: "",
    main: "",
  },
};

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

      <Route component={NotFound} />
    </Switch>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={appearance}
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
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

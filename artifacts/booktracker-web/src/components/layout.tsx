import { Link, useLocation } from "wouter";
import { Library, BarChart2, Plus, LogOut, User, Users, Settings } from "lucide-react";
import { useUser, useClerk } from "@clerk/react";
import { useTranslation } from "react-i18next";
import { setLanguage } from "@/i18n";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function LangToggle() {
  const { i18n } = useTranslation();
  const current = i18n.language.startsWith("de") ? "de" : "en";
  return (
    <button
      onClick={() => setLanguage(current === "de" ? "en" : "de")}
      className="text-xs font-mono font-semibold text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border/50 hover:border-border"
      title={current === "de" ? "Switch to English" : "Auf Deutsch wechseln"}
    >
      {current === "de" ? "EN" : "DE"}
    </button>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { t } = useTranslation();

  const displayName =
    user?.firstName ||
    user?.username ||
    user?.emailAddresses[0]?.emailAddress?.split("@")[0] ||
    "Reader";

  return (
    <div className="min-h-screen bg-background font-sans text-foreground pb-16 md:pb-0">
      <header className="sticky top-0 z-30 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto max-w-5xl px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link
              href="/"
              className="flex items-center gap-2 text-primary font-serif text-xl font-bold tracking-tight"
              data-testid="link-logo"
            >
              <img src={`${basePath}/logo.svg`} alt="" className="w-6 h-6" />
              <span>Library</span>
            </Link>
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
              <Link
                href="/"
                className={`transition-colors ${location === "/" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                data-testid="link-nav-library"
              >
                {t("nav.books")}
              </Link>
              <Link
                href="/clubs"
                className={`transition-colors ${location.startsWith("/clubs") ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                data-testid="link-nav-clubs"
              >
                {t("nav.clubs")}
              </Link>
              <Link
                href="/stats"
                className={`transition-colors ${location === "/stats" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                data-testid="link-nav-stats"
              >
                {t("nav.stats")}
              </Link>
              <Link
                href="/settings"
                className={`transition-colors ${location === "/settings" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                data-testid="link-nav-settings"
              >
                {t("nav.settings")}
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <LangToggle />

            <Link
              href="/add"
              className="inline-flex h-9 items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
              data-testid="link-nav-add-book"
            >
              <Plus className="h-4 w-4 md:mr-1.5" />
              <span className="hidden md:inline">{t("nav.addBook")}</span>
            </Link>

            {/* User menu */}
            <div className="hidden md:flex items-center gap-2 pl-3 border-l border-border/60">
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <User className="h-3.5 w-3.5" />
                <span className="max-w-[120px] truncate">{displayName}</span>
              </div>
              <button
                onClick={() => signOut({ redirectUrl: basePath || "/" })}
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-secondary"
                data-testid="button-sign-out"
                title={t("nav.signOut")}
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">{t("nav.signOut")}</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-5xl px-4 py-8 md:py-12">
        {children}
      </main>

      {/* Mobile Nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 border-t border-border bg-background p-3 flex justify-around z-30">
        <Link
          href="/"
          className={`flex flex-col items-center gap-1 text-xs font-medium transition-colors ${location === "/" ? "text-primary" : "text-muted-foreground"}`}
          data-testid="link-mobile-library"
        >
          <Library className="h-5 w-5" />
          <span>{t("nav.books")}</span>
        </Link>
        <Link
          href="/clubs"
          className={`flex flex-col items-center gap-1 text-xs font-medium transition-colors ${location.startsWith("/clubs") ? "text-primary" : "text-muted-foreground"}`}
          data-testid="link-mobile-clubs"
        >
          <Users className="h-5 w-5" />
          <span>{t("nav.clubs")}</span>
        </Link>
        <Link
          href="/stats"
          className={`flex flex-col items-center gap-1 text-xs font-medium transition-colors ${location === "/stats" ? "text-primary" : "text-muted-foreground"}`}
          data-testid="link-mobile-stats"
        >
          <BarChart2 className="h-5 w-5" />
          <span>{t("nav.stats")}</span>
        </Link>
        <Link
          href="/settings"
          className={`flex flex-col items-center gap-1 text-xs font-medium transition-colors ${location === "/settings" ? "text-primary" : "text-muted-foreground"}`}
          data-testid="link-mobile-settings"
        >
          <Settings className="h-5 w-5" />
          <span>{t("nav.settings")}</span>
        </Link>
      </div>
    </div>
  );
}

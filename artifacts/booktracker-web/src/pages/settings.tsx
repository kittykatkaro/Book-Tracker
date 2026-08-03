import { useState, useEffect } from "react"
import { useUser, useClerk } from "@clerk/react"
import { useMutation } from "@tanstack/react-query"
import { customFetch } from "@workspace/api-client-react"
import { useTranslation } from "react-i18next"
import { useTheme } from "next-themes"
import { setLanguage } from "@/i18n"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import { Sparkles, Globe, Bell, LogOut, RotateCcw, Check, Palette, AlertTriangle, Loader2 } from "lucide-react"

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "")

const APPEARANCE_OPTIONS = [
  {
    id: "light",
    nameKey: "settings.themeLight",
    swatches: ["#F8F4EE", "#2D6A4F", "#C8873F"],
  },
  {
    id: "dark",
    nameKey: "settings.themeDark",
    swatches: ["#1A1A1C", "#52B788", "#E8A35A"],
  },
  {
    id: "system",
    nameKey: "settings.themeSystem",
    swatches: ["#F8F4EE", "#1A1A1C"],
  },
  {
    id: "theme-dark-academia",
    nameKey: "settings.paletteDarkAcademia",
    swatches: ["#1C1625", "#D4A359", "#8B3A4A"],
  },
  {
    id: "theme-cozy-nook",
    nameKey: "settings.paletteCozyNook",
    swatches: ["#FDFBF7", "#5B7053", "#C27D60"],
  },
  {
    id: "theme-pastel-sunset",
    nameKey: "settings.palettePastelSunset",
    swatches: ["#FAF7FF", "#9A7AA0", "#FF7E95"],
  },
  {
    id: "theme-modern-social",
    nameKey: "settings.paletteModernSocial",
    swatches: ["#0F172A", "#0EA5E9", "#F43F5E"],
  },
] as const

export function Settings() {
  const { t, i18n } = useTranslation()
  const { user } = useUser()
  const { signOut } = useClerk()
  const { theme, setTheme } = useTheme()
  const { toast } = useToast()

  const storageKey = user?.id ? `banner_dismissed_${user.id}` : null
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [bannerReset, setBannerReset] = useState(false)
  // 0 = closed, 1 = first confirmation, 2 = final confirmation
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0)

  useEffect(() => {
    if (!storageKey) return
    setBannerDismissed(localStorage.getItem(storageKey) === "true")
  }, [storageKey])

  const handleResetBanner = () => {
    if (storageKey) localStorage.removeItem(storageKey)
    setBannerDismissed(false)
    setBannerReset(true)
    setTimeout(() => setBannerReset(false), 2000)
  }

  const deleteAccountMutation = useMutation({
    mutationFn: () =>
      customFetch("/api/user/account", {
        method: "DELETE",
        body: JSON.stringify({ confirm: true }),
      }),
    onSuccess: () => {
      // Account and data are already gone server-side; sign out locally to
      // clear the session and redirect to the sign-in flow.
      signOut({ redirectUrl: basePath || "/" })
    },
    onError: (err: Error) => {
      setDeleteStep(0)
      toast({ title: t("settings.deleteAccount"), description: err.message, variant: "destructive" })
    },
  })

  const currentLang = i18n.language.startsWith("de") ? "de" : "en"

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 max-w-2xl">
      <div>
        <h1 className="text-4xl font-serif font-bold tracking-tight text-foreground">
          {t("settings.title")}
        </h1>
        <p className="text-muted-foreground mt-1">{t("settings.subtitle")}</p>
      </div>

      {/* Onboarding */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">{t("settings.onboardingTitle")}</CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">{t("settings.onboardingDesc")}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">{t("settings.welcomeBanner")}</p>
              <p className="text-xs text-muted-foreground">{t("settings.welcomeBannerDesc")}</p>
            </div>
            {bannerDismissed ? (
              <Button
                size="sm"
                variant="outline"
                onClick={handleResetBanner}
                className="gap-1.5 rounded-full shrink-0"
                data-testid="button-reset-banner"
              >
                {bannerReset ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-green-600" />
                    {t("settings.resetDone")}
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-3.5 w-3.5" />
                    {t("settings.resetBanner")}
                  </>
                )}
              </Button>
            ) : (
              <Badge variant="secondary" className="text-xs shrink-0">
                {t("settings.bannerVisible")}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Palette className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">{t("settings.appearanceTitle")}</CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">{t("settings.appearanceDesc")}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {APPEARANCE_OPTIONS.map((opt) => {
              const isActive = theme === opt.id || (opt.id === "system" && !theme)
              return (
                <button
                  key={opt.id}
                  onClick={() => setTheme(opt.id)}
                  data-testid={`button-appearance-${opt.id}`}
                  className={`flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition-colors ${
                    isActive ? "border-primary ring-1 ring-primary" : "border-border/50 hover:border-border"
                  }`}
                >
                  <div className="flex -space-x-1.5 shrink-0">
                    {opt.swatches.map((hex, i) => (
                      <div
                        key={i}
                        className="w-4 h-4 rounded-full border border-black/10"
                        style={{ backgroundColor: hex, zIndex: opt.swatches.length - i }}
                      />
                    ))}
                  </div>
                  <span className="text-xs font-medium truncate flex-1">{t(opt.nameKey)}</span>
                  {isActive && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Language */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Globe className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">{t("settings.languageTitle")}</CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">{t("settings.languageDesc")}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={currentLang === "en" ? "default" : "outline"}
              onClick={() => setLanguage("en")}
              className="rounded-full"
              data-testid="button-lang-en"
            >
              English
            </Button>
            <Button
              size="sm"
              variant={currentLang === "de" ? "default" : "outline"}
              onClick={() => setLanguage("de")}
              className="rounded-full"
              data-testid="button-lang-de"
            >
              Deutsch
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Notifications — placeholder */}
      <Card className="border-border/50 opacity-60">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
              <Bell className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-semibold">{t("settings.notificationsTitle")}</CardTitle>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{t("settings.comingSoon")}</Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">{t("settings.notificationsDesc")}</p>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Danger zone */}
      <Card className="border-destructive/30">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">{t("settings.dangerZoneTitle")}</CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">{t("settings.dangerZoneDesc")}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">{t("settings.deleteAccount")}</p>
              <p className="text-xs text-muted-foreground">{t("settings.deleteAccountDesc")}</p>
            </div>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setDeleteStep(1)}
              className="rounded-full shrink-0"
              data-testid="button-delete-account"
            >
              {t("settings.deleteAccount")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Step 1: explain what will happen */}
      <AlertDialog open={deleteStep === 1} onOpenChange={(open) => !open && setDeleteStep(0)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.deleteAccountConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("settings.deleteAccountConfirmBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-delete-account-cancel-1">
              {t("settings.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => setDeleteStep(2)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-delete-account-continue"
            >
              {t("settings.deleteAccount")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Step 2: final, harsher confirmation */}
      <AlertDialog open={deleteStep === 2} onOpenChange={(open) => !open && setDeleteStep(0)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.deleteAccountConfirmTitle2")}</AlertDialogTitle>
            <AlertDialogDescription>{t("settings.deleteAccountConfirmBody2")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deleteAccountMutation.isPending}
              data-testid="button-delete-account-cancel-2"
            >
              {t("settings.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                deleteAccountMutation.mutate()
              }}
              disabled={deleteAccountMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-1.5"
              data-testid="button-delete-account-confirm"
            >
              {deleteAccountMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t("settings.deleteAccountAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Account / Sign out */}
      <div className="pt-2 border-t border-border/40">
        <Button
          variant="ghost"
          onClick={() => signOut({ redirectUrl: basePath || "/" })}
          className="gap-2 text-muted-foreground hover:text-foreground"
          data-testid="button-settings-sign-out"
        >
          <LogOut className="h-4 w-4" />
          {t("nav.signOut")}
        </Button>
      </div>
    </div>
  )
}

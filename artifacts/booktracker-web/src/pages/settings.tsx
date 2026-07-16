import { useState, useEffect } from "react"
import { useUser, useClerk } from "@clerk/react"
import { useTranslation } from "react-i18next"
import { setLanguage } from "@/i18n"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Sparkles, Globe, Bell, LogOut, RotateCcw, Check } from "lucide-react"

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "")

export function Settings() {
  const { t, i18n } = useTranslation()
  const { user } = useUser()
  const { signOut } = useClerk()

  const storageKey = user?.id ? `banner_dismissed_${user.id}` : null
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [bannerReset, setBannerReset] = useState(false)

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

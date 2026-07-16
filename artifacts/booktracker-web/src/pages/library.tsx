import { useListBooks, getListBooksQueryKey, useEnrichAllBooks } from "@workspace/api-client-react"
import type { Book } from "@workspace/api-client-react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Star, BookOpen, Upload, Sparkles, Loader2, Wand2 } from "lucide-react"
import { Link } from "wouter"
import { useState, useEffect, useRef, useCallback } from "react"
import { ImportBooksDialog } from "@/components/import-books-dialog"
import { useQueryClient } from "@tanstack/react-query"
import { useUser } from "@clerk/react"
import { useTranslation } from "react-i18next"

function BookCard({ book }: { book: Book }) {
  const { t } = useTranslation()
  const initial = book.title.charAt(0).toUpperCase()
  const progress = book.pages && book.currentPage ? (book.currentPage / book.pages) * 100 : 0
  
  return (
    <Link href={`/book/${book.id}`} className="group flex flex-col h-full rounded-xl overflow-hidden hover-elevate transition-all border border-border/50 bg-card" data-testid={`card-book-${book.id}`}>
      <div 
        className="w-full h-48 sm:h-56 flex items-center justify-center relative overflow-hidden"
        style={{ backgroundColor: book.coverColor }}
      >
        <span className="text-6xl sm:text-7xl font-serif text-white/90 drop-shadow-md font-bold group-hover:scale-110 transition-transform duration-500 ease-out">{initial}</span>
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-60 mix-blend-multiply"></div>
      </div>
      <CardContent className="p-4 flex flex-col flex-1">
        <div className="flex-1">
          <h3 className="font-serif font-bold text-lg leading-tight mb-1 line-clamp-2">{book.title}</h3>
          <p className="text-muted-foreground text-sm mb-3 line-clamp-1">{book.author}</p>
        </div>
        
        <div className="mt-auto space-y-3">
          {book.status === 'reading' && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{t("library.statusReading")}</span>
                <span>{book.currentPage || 0} / {book.pages || '?'} p</span>
              </div>
              <Progress value={progress} className="h-1.5 bg-accent/20" />
            </div>
          )}
          
          <div className="flex items-center justify-between">
            <Badge variant={book.status === 'reading' ? 'accent' : book.status === 'read' ? 'default' : 'secondary'} className="px-2 py-0">
              {book.status === 'reading' ? t("library.statusReading") : book.status === 'read' ? t("library.statusRead") : t("library.statusWantToRead")}
            </Badge>
            
            {book.status === 'read' && book.rating && (
              <div className="flex items-center text-amber-500">
                <Star className="h-3.5 w-3.5 fill-current" />
                <span className="text-xs font-medium ml-1">{book.rating}</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Link>
  )
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
      {Array.from({ length: 8 }).map((_, i) => (
        <Card key={i} className="overflow-hidden border-border/50 h-full flex flex-col">
          <Skeleton className="h-48 sm:h-56 w-full rounded-none" />
          <div className="p-4 space-y-3 flex-1">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <div className="pt-4 mt-auto">
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}

export function Library() {
  const { t } = useTranslation()
  const { user, isLoaded: clerkLoaded } = useUser()
  const qc = useQueryClient()
  const [tab, setTab] = useState<'all' | 'reading' | 'want_to_read' | 'read'>('all')
  const [importOpen, setImportOpen] = useState(false)
  const [enrichingCount, setEnrichingCount] = useState(0)
  const enrichTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { mutate: triggerEnrichAll, isPending: enrichAllPending } = useEnrichAllBooks({
    mutation: {
      onSuccess: (data) => {
        if (data.enriching > 0) {
          setEnrichingCount((prev) => prev + data.enriching)
          if (enrichTimerRef.current) clearTimeout(enrichTimerRef.current)
          enrichTimerRef.current = setTimeout(() => {
            setEnrichingCount(0)
            qc.invalidateQueries({ queryKey: getListBooksQueryKey() })
          }, 8000)
        }
      },
    },
  })

  const storageKey = user?.id ? `banner_dismissed_${user.id}` : null
  const [bannerDismissed, setBannerDismissed] = useState(() => {
    if (!storageKey) return false
    return localStorage.getItem(storageKey) === 'true'
  })

  useEffect(() => {
    if (!storageKey) return
    setBannerDismissed(localStorage.getItem(storageKey) === 'true')
  }, [storageKey])

  const dismissBanner = () => {
    if (storageKey) localStorage.setItem(storageKey, 'true')
    setBannerDismissed(true)
  }

  const resetBanner = () => {
    if (storageKey) localStorage.removeItem(storageKey)
    setBannerDismissed(false)
  }

  const handleImported = useCallback(({ enriching }: { imported: number; skipped: number; enriching: number }) => {
    if (enriching <= 0) return
    setEnrichingCount(enriching)
    if (enrichTimerRef.current) clearTimeout(enrichTimerRef.current)
    // Show the banner for ~8 seconds, then hide it and re-fetch so enriched
    // page counts / genres appear without requiring a manual refresh.
    enrichTimerRef.current = setTimeout(() => {
      setEnrichingCount(0)
      qc.invalidateQueries({ queryKey: getListBooksQueryKey() })
    }, 8000)
  }, [qc])

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (enrichTimerRef.current) clearTimeout(enrichTimerRef.current)
    }
  }, [])

  const { data: books, isLoading } = useListBooks(
    tab === 'all' ? undefined : { status: tab }
  )

  const { data: allBooks } = useListBooks()
  const hasBooksWithMissingFields = (allBooks ?? []).some(
    (b) => b.pages == null || b.genre == null,
  )

  const counts = {
    all: allBooks?.length || 0,
    reading: useListBooks({ status: 'reading' }).data?.length || 0,
    want_to_read: useListBooks({ status: 'want_to_read' }).data?.length || 0,
    read: useListBooks({ status: 'read' }).data?.length || 0,
  }

  const isNewUser = clerkLoaded && !isLoading && counts.all === 0 && !bannerDismissed

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-serif font-bold tracking-tight text-foreground">{t("library.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("library.subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          {hasBooksWithMissingFields && enrichingCount === 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => triggerEnrichAll()}
              disabled={enrichAllPending}
              className="gap-1.5 rounded-full border-border/60 text-muted-foreground hover:text-foreground"
              data-testid="button-enrich-all"
            >
              {enrichAllPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              Fill in missing details
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
            className="gap-1.5 rounded-full border-border/60"
            data-testid="button-import-books"
          >
            <Upload className="h-4 w-4" />
            {t("library.import")}
          </Button>
          <div className="text-sm font-medium text-muted-foreground bg-white/50 dark:bg-black/10 px-3 py-1 rounded-full border">
            {t("library.booksTotal", { count: counts.all })}
          </div>
        </div>
      </div>

      {isNewUser && (
        <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-4 rounded-2xl border border-primary/20 bg-primary/5 p-5">
          <div className="w-10 h-10 shrink-0 rounded-full bg-primary/15 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-serif font-semibold text-foreground">{t("library.welcome")}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{t("library.welcomeSub")}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" onClick={() => setImportOpen(true)} className="gap-1.5 rounded-full">
              <Upload className="h-3.5 w-3.5" /> {t("library.importLibrary")}
            </Button>
            <button
              onClick={dismissBanner}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("library.dismiss")}
            </button>
          </div>
        </div>
      )}

      <ImportBooksDialog open={importOpen} onClose={() => setImportOpen(false)} onImported={handleImported} />

      {/* Enriching banner — appears briefly after import, then auto-hides */}
      {enrichingCount > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm animate-in fade-in slide-in-from-top-2 duration-300">
          <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
          <span className="text-foreground">
            Enriching {enrichingCount} book{enrichingCount !== 1 ? "s" : ""} — filling in page counts and genres from OpenLibrary…
          </span>
        </div>
      )}

      <Tabs defaultValue="all" onValueChange={(v) => setTab(v as any)} className="w-full">
        <TabsList className="bg-transparent border-b rounded-none w-full justify-start h-auto p-0 gap-6">
          <TabsTrigger 
            value="all" 
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-0 py-3 text-base font-serif"
            data-testid="tab-all"
          >
            {t("library.tabAll")} <span className="ml-2 text-xs bg-muted px-2 py-0.5 rounded-full">{counts.all}</span>
          </TabsTrigger>
          <TabsTrigger 
            value="reading" 
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-0 py-3 text-base font-serif"
            data-testid="tab-reading"
          >
            {t("library.tabReading")} <span className="ml-2 text-xs bg-muted px-2 py-0.5 rounded-full">{counts.reading}</span>
          </TabsTrigger>
          <TabsTrigger 
            value="want_to_read" 
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-0 py-3 text-base font-serif"
            data-testid="tab-want-to-read"
          >
            {t("library.tabWantToRead")} <span className="ml-2 text-xs bg-muted px-2 py-0.5 rounded-full">{counts.want_to_read}</span>
          </TabsTrigger>
          <TabsTrigger 
            value="read" 
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-0 py-3 text-base font-serif"
            data-testid="tab-read"
          >
            {t("library.tabFinished")} <span className="ml-2 text-xs bg-muted px-2 py-0.5 rounded-full">{counts.read}</span>
          </TabsTrigger>
        </TabsList>

        <div className="mt-8">
          {isLoading ? (
            <SkeletonGrid />
          ) : !books || books.length === 0 ? (
            <div className="text-center py-20 px-4 border border-dashed rounded-2xl bg-white/40 dark:bg-black/20">
              <div className="mx-auto w-16 h-16 mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                <BookOpen className="h-8 w-8 text-primary" />
              </div>
              <h3 className="font-serif text-xl font-medium mb-2">{t("library.emptyTitle")}</h3>
              <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                {tab === 'all' 
                  ? t("library.emptyAll")
                  : t("library.emptyFiltered", { status: tab.replace('_', ' ') })}
              </p>
              <Link href="/add" className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors" data-testid="link-empty-add-book">
                {t("library.addABook")}
              </Link>
              {tab === 'all' && (
                <button
                  onClick={() => setImportOpen(true)}
                  className="text-sm text-muted-foreground hover:text-primary transition-colors underline underline-offset-4"
                  data-testid="link-empty-import"
                >
                  {t("library.importShortcut")}
                </button>
              )}
              {tab === 'all' && bannerDismissed && (
                <button
                  onClick={resetBanner}
                  className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                  data-testid="link-show-tips-again"
                >
                  {t("library.showTipsAgain")}
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
              {books.map(book => (
                <BookCard key={book.id} book={book} />
              ))}
            </div>
          )}
        </div>
      </Tabs>
    </div>
  )
}

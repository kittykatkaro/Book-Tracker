import { useListBooks } from "@workspace/api-client-react"
import type { Book } from "@workspace/api-client-react"
import { useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "wouter"
import { toPng } from "html-to-image"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Sparkles,
  BookOpen,
  Layers,
  Star,
  Trophy,
  CalendarDays,
  ArrowLeft,
} from "lucide-react"

type Ratio = "16:9" | "9:16" | "1:1"

const RATIO_DIMENSIONS: Record<Ratio, { width: number; height: number }> = {
  "16:9": { width: 1200, height: 675 },
  "9:16": { width: 675, height: 1200 },
  "1:1": { width: 1000, height: 1000 },
}

function BookCoverThumb({ book, size = 56 }: { book: Book; size?: number }) {
  const [imgFailed, setImgFailed] = useState(false)
  const initial = book.title.charAt(0).toUpperCase()
  const width = size
  const height = size * 1.35

  if (book.coverUrl && !imgFailed) {
    return (
      <img
        src={book.coverUrl}
        alt={book.title}
        crossOrigin="anonymous"
        onError={() => setImgFailed(true)}
        style={{ width, height, objectFit: "cover" }}
        className="rounded-xl shrink-0 shadow-sm"
      />
    )
  }

  // Fallback: colored initial badge — used when there's no cover image,
  // or the image failed to load (e.g. removed from storage, dead link).
  return (
    <div
      className="rounded-xl flex items-center justify-center shrink-0 shadow-sm"
      style={{ width, height, backgroundColor: book.coverColor }}
    >
      <span className="font-serif font-bold text-white/90" style={{ fontSize: size * 0.42 }}>
        {initial}
      </span>
    </div>
  )
}

function monthName(monthIndex: number, locale: string) {
  return new Date(2000, monthIndex, 1).toLocaleDateString(locale, { month: "long" })
}

function computeYearStats(books: Book[], year: number, locale: string) {
  const finished = books.filter(
    (b) => b.status === "read" && b.dateFinished && new Date(b.dateFinished).getFullYear() === year,
  )

  const totalPages = finished.reduce((sum, b) => sum + (b.pages ?? 0), 0)

  const genreCounts = new Map<string, number>()
  for (const b of finished) {
    if (!b.genre) continue
    genreCounts.set(b.genre, (genreCounts.get(b.genre) ?? 0) + 1)
  }
  const topGenre = [...genreCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? null

  const rated = finished.filter((b) => b.rating != null)
  const avgRating = rated.length > 0 ? rated.reduce((s, b) => s + (b.rating ?? 0), 0) / rated.length : null
  const topRatedBook = [...rated].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0] ?? null

  const longestBook = [...finished]
    .filter((b) => b.pages != null)
    .sort((a, b) => (b.pages ?? 0) - (a.pages ?? 0))[0] ?? null

  const monthCounts = new Array(12).fill(0)
  for (const b of finished) {
    if (!b.dateFinished) continue
    monthCounts[new Date(b.dateFinished).getMonth()]++
  }
  const busiestMonthIndex = monthCounts.every((c) => c === 0)
    ? null
    : monthCounts.indexOf(Math.max(...monthCounts))
  const busiestMonth = busiestMonthIndex != null ? monthName(busiestMonthIndex, locale) : null
  const busiestMonthCount = busiestMonthIndex != null ? monthCounts[busiestMonthIndex] : 0

  return {
    booksRead: finished.length,
    totalPages,
    topGenre,
    avgRating,
    topRatedBook,
    longestBook,
    busiestMonth,
    busiestMonthCount,
  }
}

export function Wrapped() {
  const { t, i18n } = useTranslation()
  const { toast } = useToast()
  const { data: books, isLoading } = useListBooks()
  const [slide, setSlide] = useState(0)
  const [ratio, setRatio] = useState<Ratio>("9:16")
  const [exporting, setExporting] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  const availableYears = useMemo(() => {
    if (!books) return []
    const years = new Set<number>()
    for (const b of books) {
      if (b.status === "read" && b.dateFinished) years.add(new Date(b.dateFinished).getFullYear())
    }
    return [...years].sort((a, b) => b - a)
  }, [books])

  const currentCalendarYear = new Date().getFullYear()
  const [year, setYear] = useState<number | null>(null)
  const effectiveYear =
    year ?? (availableYears.includes(currentCalendarYear) ? currentCalendarYear : availableYears[0] ?? currentCalendarYear)

  const stats = useMemo(
    () => (books ? computeYearStats(books, effectiveYear, i18n.language) : null),
    [books, effectiveYear, i18n.language],
  )

  const handleExport = async () => {
    if (!cardRef.current) return
    setExporting(true)
    try {
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: 2,
        cacheBust: true,
      })
      const link = document.createElement("a")
      link.download = `booktracker-wrapped-${effectiveYear}-${ratio.replace(":", "x")}.png`
      link.href = dataUrl
      link.click()
    } catch (err) {
      console.error("[wrapped] export failed:", err)
      toast({
        title: t("wrapped.exportFailedTitle"),
        description: t("wrapped.exportFailedDesc"),
        variant: "destructive",
      })
    } finally {
      setExporting(false)
    }
  }

  if (isLoading || !books) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[500px] w-full max-w-md mx-auto rounded-3xl" />
      </div>
    )
  }

  if (availableYears.length === 0 || !stats || stats.booksRead === 0) {
    return (
      <div className="space-y-6 animate-in fade-in duration-700">
        <Link href="/stats" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> {t("wrapped.backToStats")}
        </Link>
        <div className="text-center py-20 px-4 border border-dashed rounded-2xl bg-white/40 dark:bg-black/20 max-w-lg mx-auto">
          <div className="mx-auto w-16 h-16 mb-4 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
          <h3 className="font-serif text-xl font-medium mb-2">{t("wrapped.noDataTitle")}</h3>
          <p className="text-muted-foreground max-w-sm mx-auto">{t("wrapped.noDataDesc")}</p>
        </div>
      </div>
    )
  }

  const slides = [
    {
      key: "intro",
      render: () => (
        <div className="flex flex-col items-center justify-center h-full text-center gap-3 px-8">
          <Sparkles className="h-10 w-10 text-primary" />
          <p className="text-sm uppercase tracking-widest text-muted-foreground">{t("wrapped.yourYear", { year: effectiveYear })}</p>
          <h2 className="text-4xl font-serif font-bold">{t("wrapped.introTitle")}</h2>
        </div>
      ),
    },
    {
      key: "booksRead",
      render: () => (
        <div className="flex flex-col items-center justify-center h-full text-center gap-3 px-8">
          <BookOpen className="h-8 w-8 text-primary" />
          <div className="text-7xl font-serif font-bold text-primary">{stats.booksRead}</div>
          <p className="text-lg text-muted-foreground">{t("wrapped.booksReadLabel", { year: effectiveYear })}</p>
        </div>
      ),
    },
    {
      key: "pagesRead",
      render: () => (
        <div className="flex flex-col items-center justify-center h-full text-center gap-3 px-8">
          <Layers className="h-8 w-8 text-primary" />
          <div className="text-6xl font-serif font-bold text-primary">{stats.totalPages.toLocaleString()}</div>
          <p className="text-lg text-muted-foreground">{t("wrapped.pagesReadLabel")}</p>
        </div>
      ),
    },
    ...(stats.topGenre
      ? [
          {
            key: "topGenre",
            render: () => (
              <div className="flex flex-col items-center justify-center h-full text-center gap-3 px-8">
                <p className="text-sm uppercase tracking-widest text-muted-foreground">{t("wrapped.topGenreLabel")}</p>
                <h2 className="text-5xl font-serif font-bold text-primary">{stats.topGenre![0]}</h2>
                <p className="text-muted-foreground">{t("wrapped.topGenreCount", { count: stats.topGenre![1] })}</p>
              </div>
            ),
          },
        ]
      : []),
    ...(stats.topRatedBook
      ? [
          {
            key: "topRated",
            render: () => (
              <div className="flex flex-col items-center justify-center h-full text-center gap-4 px-8">
                <p className="text-sm uppercase tracking-widest text-muted-foreground">{t("wrapped.topRatedLabel")}</p>
                <BookCoverThumb book={stats.topRatedBook!} size={72} />
                <div>
                  <h2 className="text-2xl font-serif font-bold">{stats.topRatedBook!.title}</h2>
                  <p className="text-muted-foreground">{stats.topRatedBook!.author}</p>
                </div>
                <div className="flex items-center gap-1 text-amber-500">
                  {Array.from({ length: stats.topRatedBook!.rating ?? 0 }).map((_, i) => (
                    <Star key={i} className="h-5 w-5 fill-current" />
                  ))}
                </div>
              </div>
            ),
          },
        ]
      : []),
    ...(stats.longestBook
      ? [
          {
            key: "longest",
            render: () => (
              <div className="flex flex-col items-center justify-center h-full text-center gap-4 px-8">
                <Trophy className="h-8 w-8 text-primary" />
                <p className="text-sm uppercase tracking-widest text-muted-foreground">{t("wrapped.longestLabel")}</p>
                <BookCoverThumb book={stats.longestBook!} size={72} />
                <div>
                  <h2 className="text-2xl font-serif font-bold">{stats.longestBook!.title}</h2>
                  <p className="text-muted-foreground">{t("wrapped.pagesCount", { count: stats.longestBook!.pages ?? 0 })}</p>
                </div>
              </div>
            ),
          },
        ]
      : []),
    ...(stats.busiestMonth
      ? [
          {
            key: "busiestMonth",
            render: () => (
              <div className="flex flex-col items-center justify-center h-full text-center gap-3 px-8">
                <CalendarDays className="h-8 w-8 text-primary" />
                <h2 className="text-4xl font-serif font-bold text-primary">{stats.busiestMonth}</h2>
                <p className="text-muted-foreground">
                  {t("wrapped.busiestMonthDesc", { count: stats.busiestMonthCount })}
                </p>
              </div>
            ),
          },
        ]
      : []),
    {
      key: "recap",
      render: () => (
        <div className="flex flex-col items-center justify-center h-full text-center gap-2 px-8">
          <p className="text-sm uppercase tracking-widest text-muted-foreground mb-2">{t("wrapped.recapReady")}</p>
          <p className="text-muted-foreground max-w-xs">{t("wrapped.recapDesc")}</p>
        </div>
      ),
    },
  ]

  const dims = RATIO_DIMENSIONS[ratio]
  const scale = 280 / Math.max(dims.width, dims.height)

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <Link href="/stats" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> {t("wrapped.backToStats")}
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-serif font-bold tracking-tight text-foreground">{t("wrapped.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("wrapped.subtitle")}</p>
        </div>
        {availableYears.length > 1 && (
          <div className="flex gap-2">
            {availableYears.map((y) => (
              <Button
                key={y}
                size="sm"
                variant={y === effectiveYear ? "default" : "outline"}
                className="rounded-full"
                onClick={() => {
                  setYear(y)
                  setSlide(0)
                }}
                data-testid={`button-wrapped-year-${y}`}
              >
                {y}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Slide carousel */}
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-full max-w-md aspect-[3/4] rounded-3xl border border-border/50 bg-gradient-to-b from-primary/5 to-accent/5 overflow-hidden">
          {slides[slide]?.render()}
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSlide((s) => Math.max(0, s - 1))}
            disabled={slide === 0}
            className="rounded-full p-2 border border-border/50 disabled:opacity-30 hover:border-border transition-colors"
            aria-label={t("wrapped.prevSlide")}
            data-testid="button-wrapped-prev"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex gap-1.5">
            {slides.map((s, i) => (
              <button
                key={s.key}
                onClick={() => setSlide(i)}
                className={`h-1.5 rounded-full transition-all ${i === slide ? "w-5 bg-primary" : "w-1.5 bg-muted"}`}
                aria-label={`${t("wrapped.slide")} ${i + 1}`}
              />
            ))}
          </div>
          <button
            onClick={() => setSlide((s) => Math.min(slides.length - 1, s + 1))}
            disabled={slide === slides.length - 1}
            className="rounded-full p-2 border border-border/50 disabled:opacity-30 hover:border-border transition-colors"
            aria-label={t("wrapped.nextSlide")}
            data-testid="button-wrapped-next"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Export section */}
      <div className="max-w-md mx-auto border-t border-border/50 pt-8 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-lg font-semibold">{t("wrapped.exportTitle")}</h3>
          <div className="flex gap-1.5">
            {(Object.keys(RATIO_DIMENSIONS) as Ratio[]).map((r) => (
              <button
                key={r}
                onClick={() => setRatio(r)}
                className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                  ratio === r ? "border-primary bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:border-border"
                }`}
                data-testid={`button-wrapped-ratio-${r.replace(":", "x")}`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Export preview (scaled down; captured at full resolution on export) */}
        <div className="flex justify-center py-2">
          <div style={{ width: dims.width * scale, height: dims.height * scale }} className="overflow-hidden rounded-xl border border-border/50 shadow-sm">
            <div
              style={{
                width: dims.width,
                height: dims.height,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
              }}
            >
              <div
                ref={cardRef}
                style={{ width: dims.width, height: dims.height }}
                className="flex flex-col items-center justify-center gap-6 bg-gradient-to-br from-primary/10 via-background to-accent/10 p-10"
              >
                <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">{t("wrapped.cardEyebrow", { year: effectiveYear })}</p>
                <h2 className="text-5xl font-serif font-bold text-center text-foreground">{t("wrapped.cardTitle")}</h2>

                <div className="flex gap-10 mt-4">
                  <div className="text-center">
                    <div className="text-5xl font-serif font-bold text-primary">{stats.booksRead}</div>
                    <p className="text-sm text-muted-foreground mt-1">{t("wrapped.booksReadShort")}</p>
                  </div>
                  <div className="text-center">
                    <div className="text-5xl font-serif font-bold text-primary">{stats.totalPages.toLocaleString()}</div>
                    <p className="text-sm text-muted-foreground mt-1">{t("wrapped.pagesReadShort")}</p>
                  </div>
                </div>

                {stats.topGenre && (
                  <p className="text-base text-foreground mt-2">
                    {t("wrapped.cardTopGenre", { genre: stats.topGenre[0] })}
                  </p>
                )}

                {stats.topRatedBook && (
                  <div className="flex items-center gap-3 mt-2 bg-card/60 rounded-2xl px-4 py-3 border border-border/40">
                    <BookCoverThumb book={stats.topRatedBook} size={48} />
                    <div className="text-left">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("wrapped.topRatedLabel")}</p>
                      <p className="font-serif font-semibold leading-tight">{stats.topRatedBook.title}</p>
                    </div>
                  </div>
                )}

                <p className="text-xs text-muted-foreground/70 mt-auto tracking-widest uppercase">
                  {t("wrapped.cardBrand")}
                </p>
              </div>
            </div>
          </div>
        </div>

        <Button onClick={handleExport} disabled={exporting} className="w-full rounded-full gap-2" data-testid="button-wrapped-export">
          <Download className="h-4 w-4" />
          {exporting ? t("wrapped.exporting") : t("wrapped.exportButton", { ratio })}
        </Button>
      </div>
    </div>
  )
}

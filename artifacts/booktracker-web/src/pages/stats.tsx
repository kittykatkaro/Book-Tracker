import { useGetBookStats } from "@workspace/api-client-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts"
import { Library, BookOpen, CheckCircle2, Star, TrendingUp } from "lucide-react"
import { useTranslation } from "react-i18next"

export function Stats() {
  const { t } = useTranslation()
  const { data: stats, isLoading } = useGetBookStats()

  if (isLoading || !stats) {
    return (
      <div className="space-y-8">
        <div>
          <Skeleton className="h-10 w-48 mb-2" />
          <Skeleton className="h-5 w-64" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({length: 4}).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
        <Skeleton className="h-[400px] rounded-xl w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div>
        <h1 className="text-4xl font-serif font-bold tracking-tight text-foreground">{t("stats.title")}</h1>
        <p className="text-muted-foreground mt-1 text-lg">{t("stats.subtitle")}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 md:gap-6">
        <Card className="bg-primary/5 border-primary/10">
          <CardContent className="p-6 flex flex-col items-center justify-center text-center h-full">
            <Library className="h-6 w-6 text-primary mb-3" />
            <div className="text-4xl font-serif font-bold text-primary" data-testid="stat-total">{stats.total}</div>
            <p className="text-sm font-medium text-primary/80 mt-1">{t("stats.totalBooks")}</p>
          </CardContent>
        </Card>
        
        <Card className="bg-accent/5 border-accent/10">
          <CardContent className="p-6 flex flex-col items-center justify-center text-center h-full">
            <BookOpen className="h-6 w-6 text-accent mb-3" />
            <div className="text-4xl font-serif font-bold text-accent" data-testid="stat-reading">{stats.reading}</div>
            <p className="text-sm font-medium text-accent/80 mt-1">{t("stats.reading")}</p>
          </CardContent>
        </Card>

        <Card className="bg-secondary/50 border-secondary">
          <CardContent className="p-6 flex flex-col items-center justify-center text-center h-full">
            <CheckCircle2 className="h-6 w-6 text-muted-foreground mb-3" />
            <div className="text-4xl font-serif font-bold" data-testid="stat-finished">{stats.read}</div>
            <p className="text-sm font-medium text-muted-foreground mt-1">{t("stats.finished")}</p>
          </CardContent>
        </Card>

        <Card className="bg-secondary/30 border-secondary/50">
          <CardContent className="p-6 flex flex-col items-center justify-center text-center h-full">
            <Library className="h-6 w-6 text-muted-foreground mb-3" />
            <div className="text-4xl font-serif font-bold" data-testid="stat-want-to-read">{stats.wantToRead}</div>
            <p className="text-sm font-medium text-muted-foreground mt-1">{t("stats.toRead")}</p>
          </CardContent>
        </Card>

        <Card className="bg-amber-500/5 border-amber-500/10">
          <CardContent className="p-6 flex flex-col items-center justify-center text-center h-full">
            <Star className="h-6 w-6 text-amber-500 mb-3" />
            <div className="text-4xl font-serif font-bold text-amber-600 dark:text-amber-400" data-testid="stat-avg-rating">
              {stats.avgRating ? stats.avgRating.toFixed(1) : '-'}
            </div>
            <p className="text-sm font-medium text-amber-600/80 dark:text-amber-400/80 mt-1">{t("stats.avgRating")}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-1 border-border/50 bg-white/50 dark:bg-black/20">
          <CardHeader>
            <CardTitle className="font-serif text-xl flex items-center">
              <TrendingUp className="h-5 w-5 mr-2 text-primary" />
              {t("stats.thisYear")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex justify-between items-end border-b border-border/50 pb-4">
              <span className="text-muted-foreground">{t("stats.booksRead")}</span>
              <span className="text-3xl font-serif font-bold">{stats.readThisYear}</span>
            </div>
            <div className="flex justify-between items-end border-b border-border/50 pb-4">
              <span className="text-muted-foreground">{t("stats.pagesRead")}</span>
              <span className="text-3xl font-serif font-bold">{stats.totalPages.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-end">
              <span className="text-muted-foreground">{t("stats.toReadList")}</span>
              <span className="text-3xl font-serif font-bold text-muted-foreground">{stats.wantToRead}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 border-border/50 bg-white/50 dark:bg-black/20">
          <CardHeader>
            <CardTitle className="font-serif text-xl">{t("stats.topGenres")}</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.topGenres && stats.topGenres.length > 0 ? (
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.topGenres} layout="vertical" margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <XAxis type="number" hide />
                    <YAxis 
                      dataKey="genre" 
                      type="category" 
                      axisLine={false} 
                      tickLine={false}
                      tick={{ fill: 'currentColor', fontSize: 12, fontFamily: 'var(--font-sans)' }}
                      width={100}
                    />
                    <Tooltip 
                      cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                      contentStyle={{ borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-card)' }}
                      formatter={(value) => [`${value} ${t("stats.booksRead").toLowerCase()}`, t("stats.count")]}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={24}>
                      {stats.topGenres.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={`hsl(var(--primary))`} fillOpacity={0.8 - (index * 0.1)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">
                {t("stats.noGenreData")}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

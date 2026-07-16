import { useListBooks } from "@workspace/api-client-react"
import { Book } from "@workspace/api-client-react/src/generated/api.schemas"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Star, BookOpen, Upload, Sparkles } from "lucide-react"
import { Link } from "wouter"
import { useState } from "react"
import { ImportBooksDialog } from "@/components/import-books-dialog"

function BookCard({ book }: { book: Book }) {
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
                <span>Reading</span>
                <span>{book.currentPage || 0} / {book.pages || '?'} p</span>
              </div>
              <Progress value={progress} className="h-1.5 bg-accent/20" />
            </div>
          )}
          
          <div className="flex items-center justify-between">
            <Badge variant={book.status === 'reading' ? 'accent' : book.status === 'read' ? 'default' : 'secondary'} className="px-2 py-0">
              {book.status === 'reading' ? 'Reading' : book.status === 'read' ? 'Read' : 'Want to Read'}
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
  const [tab, setTab] = useState<'all' | 'reading' | 'want_to_read' | 'read'>('all')
  const [importOpen, setImportOpen] = useState(false)
  const [bannerDismissed, setBannerDismissed] = useState(false)

  const { data: books, isLoading } = useListBooks(
    tab === 'all' ? undefined : { status: tab }
  )

  const counts = {
    all: useListBooks().data?.length || 0,
    reading: useListBooks({ status: 'reading' }).data?.length || 0,
    want_to_read: useListBooks({ status: 'want_to_read' }).data?.length || 0,
    read: useListBooks({ status: 'read' }).data?.length || 0,
  }

  const isNewUser = !isLoading && counts.all === 0 && !bannerDismissed

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-serif font-bold tracking-tight text-foreground">Your Library</h1>
          <p className="text-muted-foreground mt-1">A curated collection of your literary journey.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
            className="gap-1.5 rounded-full border-border/60"
            data-testid="button-import-books"
          >
            <Upload className="h-4 w-4" />
            Import
          </Button>
          <div className="text-sm font-medium text-muted-foreground bg-white/50 dark:bg-black/10 px-3 py-1 rounded-full border">
            {counts.all} Books Total
          </div>
        </div>
      </div>

      {/* Onboarding banner — shown only to new users with an empty library */}
      {isNewUser && (
        <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-4 rounded-2xl border border-primary/20 bg-primary/5 p-5">
          <div className="w-10 h-10 shrink-0 rounded-full bg-primary/15 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-serif font-semibold text-foreground">Welcome to your library!</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Add books one by one, or import your entire reading history from Goodreads, a spreadsheet, or a document.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" onClick={() => setImportOpen(true)} className="gap-1.5 rounded-full">
              <Upload className="h-3.5 w-3.5" /> Import library
            </Button>
            <button
              onClick={() => setBannerDismissed(true)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <ImportBooksDialog open={importOpen} onClose={() => setImportOpen(false)} />

      <Tabs defaultValue="all" onValueChange={(v) => setTab(v as any)} className="w-full">
        <TabsList className="bg-transparent border-b rounded-none w-full justify-start h-auto p-0 gap-6">
          <TabsTrigger 
            value="all" 
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-0 py-3 text-base font-serif"
            data-testid="tab-all"
          >
            All <span className="ml-2 text-xs bg-muted px-2 py-0.5 rounded-full">{counts.all}</span>
          </TabsTrigger>
          <TabsTrigger 
            value="reading" 
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-0 py-3 text-base font-serif"
            data-testid="tab-reading"
          >
            Reading <span className="ml-2 text-xs bg-muted px-2 py-0.5 rounded-full">{counts.reading}</span>
          </TabsTrigger>
          <TabsTrigger 
            value="want_to_read" 
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-0 py-3 text-base font-serif"
            data-testid="tab-want-to-read"
          >
            Want to Read <span className="ml-2 text-xs bg-muted px-2 py-0.5 rounded-full">{counts.want_to_read}</span>
          </TabsTrigger>
          <TabsTrigger 
            value="read" 
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-0 py-3 text-base font-serif"
            data-testid="tab-read"
          >
            Finished <span className="ml-2 text-xs bg-muted px-2 py-0.5 rounded-full">{counts.read}</span>
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
              <h3 className="font-serif text-xl font-medium mb-2">No books found</h3>
              <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                {tab === 'all' 
                  ? "Your library is empty. Add a book to begin your tracking journey."
                  : `You don't have any books marked as ${tab.replace('_', ' ')}.`}
              </p>
              <Link href="/add" className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors" data-testid="link-empty-add-book">
                Add a Book
              </Link>
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
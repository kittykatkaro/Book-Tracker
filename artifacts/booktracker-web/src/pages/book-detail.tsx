import { useGetBook, useUpdateBook, useDeleteBook, getGetBookQueryKey, getListBooksQueryKey } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { useParams, useLocation } from "wouter"
import { Link } from "wouter"
import { format } from "date-fns"
import { useRef, useState, useEffect } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
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
  AlertDialogTrigger 
} from "@/components/ui/alert-dialog"

import { ArrowLeft, Trash2, Calendar, Star, BookOpen, Clock } from "lucide-react"

export function BookDetail() {
  const { id } = useParams<{ id: string }>()
  const [, setLocation] = useLocation()
  const queryClient = useQueryClient()
  
  const { data: book, isLoading } = useGetBook(id!, { query: { queryKey: getGetBookQueryKey(id!) } })
  const updateBook = useUpdateBook()
  const deleteBook = useDeleteBook()

  // Local state for auto-save inputs
  const [notes, setNotes] = useState("")
  const [currentPage, setCurrentPage] = useState<string>("")
  const initializedForId = useRef<string | null>(null)
  const saveTimeout = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (book && initializedForId.current !== book.id) {
      initializedForId.current = book.id
      setNotes(book.notes || "")
      setCurrentPage(book.currentPage ? String(book.currentPage) : "")
    }
  }, [book])

  const handleStatusChange = (newStatus: 'reading' | 'read' | 'want_to_read') => {
    const updates: any = { status: newStatus }
    if (newStatus === 'reading' && !book?.dateStarted) {
      updates.dateStarted = new Date().toISOString()
    }
    if (newStatus === 'read' && !book?.dateFinished) {
      updates.dateFinished = new Date().toISOString()
    }
    
    updateBook.mutate({ id: id!, data: updates }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetBookQueryKey(id!) })
        queryClient.invalidateQueries({ queryKey: getListBooksQueryKey() })
      }
    })
  }

  const handleRating = (rating: number) => {
    updateBook.mutate({ id: id!, data: { rating } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetBookQueryKey(id!) })
        queryClient.invalidateQueries({ queryKey: getListBooksQueryKey() })
      }
    })
  }

  const handleSaveNotes = (value: string) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => {
      updateBook.mutate({ id: id!, data: { notes: value } }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetBookQueryKey(id!) })
      })
    }, 1000)
  }

  const handleSaveCurrentPage = (value: string) => {
    const pageNum = parseInt(value, 10)
    if (isNaN(pageNum)) return

    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => {
      updateBook.mutate({ id: id!, data: { currentPage: pageNum } }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetBookQueryKey(id!) })
      })
    }, 800)
  }

  const handleDelete = () => {
    deleteBook.mutate({ id: id! }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListBooksQueryKey() })
        setLocation("/")
      }
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-8 animate-pulse">
        <Skeleton className="h-6 w-32" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <Skeleton className="h-96 rounded-xl" />
          <div className="md:col-span-2 space-y-4">
            <Skeleton className="h-12 w-3/4" />
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-20 w-full mt-8" />
          </div>
        </div>
      </div>
    )
  }

  if (!book) return <div>Book not found</div>

  const initial = book.title.charAt(0).toUpperCase()
  const progress = book.pages && book.currentPage ? (book.currentPage / book.pages) * 100 : 0

  return (
    <div className="space-y-8 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex justify-between items-center">
        <Link href="/" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-primary transition-colors" data-testid="link-back-library">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Library
        </Link>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" data-testid="button-delete-trigger">
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this book?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently remove {book.title} from your library.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-delete-cancel">Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="button-delete-confirm">
                Delete Book
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12">
        {/* Cover Column */}
        <div className="md:col-span-4 lg:col-span-3 space-y-6">
          <div 
            className="w-full aspect-[2/3] rounded-2xl flex items-center justify-center relative overflow-hidden shadow-xl"
            style={{ backgroundColor: book.coverColor }}
          >
            <span className="text-9xl font-serif text-white/90 drop-shadow-lg font-bold">{initial}</span>
            <div className="absolute inset-0 bg-gradient-to-tr from-black/50 to-transparent opacity-60 mix-blend-multiply"></div>
            <div className="absolute inset-0 ring-1 ring-inset ring-white/20 rounded-2xl pointer-events-none"></div>
          </div>
          
          <div className="bg-white/50 dark:bg-black/20 rounded-xl p-4 border border-border/50 space-y-3">
            <div className="flex items-center text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5 mr-2" />
              Added {format(new Date(book.dateAdded), "MMM d, yyyy")}
            </div>
            {book.dateStarted && (
              <div className="flex items-center text-xs text-muted-foreground">
                <BookOpen className="h-3.5 w-3.5 mr-2" />
                Started {format(new Date(book.dateStarted), "MMM d, yyyy")}
              </div>
            )}
            {book.dateFinished && (
              <div className="flex items-center text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5 mr-2" />
                Finished {format(new Date(book.dateFinished), "MMM d, yyyy")}
              </div>
            )}
            {book.genre && (
              <div className="pt-2 mt-2 border-t border-border/50">
                <Badge variant="secondary" className="font-normal">{book.genre}</Badge>
              </div>
            )}
          </div>
        </div>

        {/* Details Column */}
        <div className="md:col-span-8 lg:col-span-9 space-y-8">
          <div>
            <h1 className="text-4xl md:text-5xl font-serif font-bold tracking-tight mb-2">{book.title}</h1>
            <p className="text-xl md:text-2xl text-muted-foreground font-serif italic">{book.author}</p>
          </div>

          {/* Status segmented control */}
          <div className="bg-secondary/50 p-1.5 rounded-lg inline-flex w-full sm:w-auto overflow-hidden">
            {[
              { id: 'want_to_read', label: 'Want to Read' },
              { id: 'reading', label: 'Reading' },
              { id: 'read', label: 'Finished' }
            ].map(status => (
              <button
                key={status.id}
                onClick={() => handleStatusChange(status.id as any)}
                data-testid={`button-status-${status.id}`}
                className={`flex-1 sm:px-6 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
                  book.status === status.id 
                    ? 'bg-background shadow-sm text-foreground' 
                    : 'text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                {status.label}
              </button>
            ))}
          </div>

          {book.status === 'reading' && (
            <div className="bg-accent/10 border border-accent/20 rounded-xl p-6 space-y-4">
              <div className="flex justify-between items-end">
                <h3 className="font-serif font-semibold text-lg text-accent-foreground flex items-center">
                  <BookOpen className="h-5 w-5 mr-2 text-accent" />
                  Reading Progress
                </h3>
                <div className="flex items-center gap-2">
                  <Input 
                    type="number" 
                    value={currentPage}
                    onChange={(e) => {
                      setCurrentPage(e.target.value)
                      handleSaveCurrentPage(e.target.value)
                    }}
                    className="w-20 text-center h-8 bg-background" 
                    placeholder="Pg"
                    data-testid="input-current-page"
                  />
                  <span className="text-sm text-muted-foreground">/ {book.pages || '?'}</span>
                </div>
              </div>
              <Progress value={progress} className="h-3" />
              <p className="text-xs text-muted-foreground text-right">{Math.round(progress)}% complete</p>
            </div>
          )}

          {book.status === 'read' && (
            <div className="bg-primary/5 border border-primary/10 rounded-xl p-6 flex flex-col items-center sm:flex-row sm:justify-between gap-4">
              <h3 className="font-serif font-semibold text-lg text-primary flex items-center">
                <Star className="h-5 w-5 mr-2" />
                Your Rating
              </h3>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => handleRating(star)}
                    className="p-1 transition-transform hover:scale-110 focus:outline-none"
                    data-testid={`button-rate-${star}`}
                  >
                    <Star 
                      className={`h-8 w-8 ${
                        (book.rating || 0) >= star 
                          ? 'fill-amber-500 text-amber-500' 
                          : 'text-muted-foreground/30 hover:text-amber-500/50'
                      }`} 
                    />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3 pt-4">
            <h3 className="font-serif font-semibold text-xl border-b border-border/50 pb-2">Notes & Thoughts</h3>
            <Textarea 
              placeholder="Jot down your impressions, favorite quotes, or thoughts..."
              className="min-h-[200px] resize-y bg-white/50 dark:bg-black/20 border-border/50 focus-visible:bg-background text-base p-4 leading-relaxed"
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value)
                handleSaveNotes(e.target.value)
              }}
              data-testid="textarea-notes"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
import { useGetBook, useUpdateBook, useDeleteBook, getGetBookQueryKey, getListBooksQueryKey, GENRES } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { useParams, useLocation } from "wouter"
import { Link } from "wouter"
import { format } from "date-fns"
import { useRef, useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { useToast } from "@/hooks/use-toast"

import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"

import { ArrowLeft, Trash2, Calendar, Star, BookOpen, Clock, Camera, Link2, X, Loader2, Pencil } from "lucide-react"

const NO_GENRE = "__none__"

// ---------------------------------------------------------------------------
// Edit Book Dialog
// ---------------------------------------------------------------------------

interface EditableBook {
  title: string
  author: string
  genre: string | null
}

function EditBookDialog({
  book,
  open,
  onClose,
  onSave,
  saving,
}: {
  book: EditableBook
  open: boolean
  onClose: () => void
  onSave: (data: EditableBook) => void
  saving: boolean
}) {
  const { t } = useTranslation()
  const [title, setTitle] = useState(book.title)
  const [author, setAuthor] = useState(book.author)
  const [genre, setGenre] = useState(book.genre || "")

  useEffect(() => {
    if (open) {
      setTitle(book.title)
      setAuthor(book.author)
      setGenre(book.genre || "")
    }
  }, [open, book])

  const handleSave = () => {
    onSave({
      title: title.trim(),
      author: author.trim(),
      genre: genre || null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-serif">{t("bookDetail.editDialog.title")}</DialogTitle>
          <DialogDescription>{t("bookDetail.editDialog.description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="edit-title">{t("bookDetail.editDialog.titleLabel")}</Label>
            <Input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} data-testid="input-edit-title" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-author">{t("bookDetail.editDialog.authorLabel")}</Label>
            <Input id="edit-author" value={author} onChange={(e) => setAuthor(e.target.value)} data-testid="input-edit-author" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("bookDetail.editDialog.genreLabel")}</Label>
            <Select
              onValueChange={(v) => setGenre(v === NO_GENRE ? "" : v)}
              value={genre || NO_GENRE}
            >
              <SelectTrigger data-testid="select-edit-genre">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_GENRE}>{t("addBook.genreNone")}</SelectItem>
                {GENRES.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose} disabled={saving}>{t("bookDetail.editDialog.cancel")}</Button>
            <Button
              onClick={handleSave}
              disabled={!title.trim() || !author.trim() || saving}
              data-testid="button-save-edit"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {saving ? t("bookDetail.editDialog.saving") : t("bookDetail.editDialog.save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function BookDetail() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const [, setLocation] = useLocation()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data: book, isLoading } = useGetBook(id!, { query: { queryKey: getGetBookQueryKey(id!) } })
  const updateBook = useUpdateBook()
  const deleteBook = useDeleteBook()

  const [notes, setNotes] = useState("")
  const [currentPage, setCurrentPage] = useState<string>("")
  const [editOpen, setEditOpen] = useState(false)
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

  const handleEditSave = (data: { title: string; author: string; genre: string | null }) => {
    updateBook.mutate({ id: id!, data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetBookQueryKey(id!) })
        queryClient.invalidateQueries({ queryKey: getListBooksQueryKey() })
        setEditOpen(false)
        toast({ title: t("bookDetail.editDialog.successTitle") })
      },
      onError: () => {
        toast({
          title: t("bookDetail.editDialog.errorTitle"),
          description: t("bookDetail.editDialog.errorDesc"),
          variant: "destructive",
        })
      },
    })
  }

  // --- Cover change state ---
  const [coverDialogOpen, setCoverDialogOpen] = useState(false)
  const [coverUrlInput, setCoverUrlInput] = useState("")
  const [coverSaving, setCoverSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const invalidateBoth = () => {
    queryClient.invalidateQueries({ queryKey: getGetBookQueryKey(id!) })
    queryClient.invalidateQueries({ queryKey: getListBooksQueryKey() })
  }

  const handleSaveCoverUrl = async () => {
    if (!coverUrlInput.trim()) return
    setCoverSaving(true)
    try {
      await updateBook.mutateAsync({ id: id!, data: { coverUrl: coverUrlInput.trim() } })
      invalidateBoth()
      setCoverDialogOpen(false)
      setCoverUrlInput("")
    } finally {
      setCoverSaving(false)
    }
  }

  const handleFileUpload = async (file: File) => {
    setCoverSaving(true)
    try {
      const formData = new FormData()
      formData.append("cover", file)
      const result = await fetch(`/api/books/${id}/cover`, {
        method: "POST",
        body: formData,
        credentials: "include",
      })
      if (!result.ok) throw new Error("Upload failed")
      invalidateBoth()
      setCoverDialogOpen(false)
    } finally {
      setCoverSaving(false)
    }
  }

  const handleRemoveCover = async () => {
    await updateBook.mutateAsync({ id: id!, data: { coverUrl: null } })
    invalidateBoth()
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

  if (!book) return <div>{t("bookDetail.deleteTitle")}</div>

  const initial = book.title.charAt(0).toUpperCase()
  const progress = book.pages && book.currentPage ? (book.currentPage / book.pages) * 100 : 0

  const statusOptions = [
    { id: 'want_to_read', label: t("bookDetail.statusWantToRead") },
    { id: 'reading', label: t("bookDetail.statusReading") },
    { id: 'read', label: t("bookDetail.statusFinished") },
  ]

  return (
    <div className="space-y-8 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex justify-between items-center">
        <Link href="/" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-primary transition-colors" data-testid="link-back-library">
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t("bookDetail.backToLibrary")}
        </Link>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setEditOpen(true)}
            data-testid="button-edit-trigger"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" data-testid="button-delete-trigger">
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("bookDetail.deleteTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("bookDetail.deleteDesc", { title: book.title })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-delete-cancel">{t("bookDetail.cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="button-delete-confirm">
                {t("bookDetail.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <EditBookDialog
        book={{ title: book.title, author: book.author, genre: book.genre ?? null }}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSave={handleEditSave}
        saving={updateBook.isPending}
      />

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12">
        {/* Cover Column */}
        <div className="md:col-span-4 lg:col-span-3 space-y-6">
          <div 
            className="w-full aspect-[2/3] rounded-2xl flex items-center justify-center relative overflow-hidden shadow-xl"
            style={{ backgroundColor: book.coverUrl ? undefined : book.coverColor }}
          >
            {book.coverUrl ? (
              <img src={book.coverUrl} alt={book.title} className="w-full h-full object-cover" />
            ) : (
              <>
                <span className="text-9xl font-serif text-white/90 drop-shadow-lg font-bold">{initial}</span>
                <div className="absolute inset-0 bg-gradient-to-tr from-black/50 to-transparent opacity-60 mix-blend-multiply"></div>
                <div className="absolute inset-0 ring-1 ring-inset ring-white/20 rounded-2xl pointer-events-none"></div>
              </>
            )}
          </div>

          {/* Change cover controls */}
          <div className="flex flex-col gap-2">
            <Button variant="outline" size="sm" className="w-full gap-2 rounded-full text-muted-foreground" onClick={() => setCoverDialogOpen(true)}>
              <Camera className="h-4 w-4" />
              {t("bookDetail.changeCover")}
            </Button>
            {book.coverUrl && (
              <Button variant="ghost" size="sm" className="w-full gap-2 rounded-full text-destructive hover:text-destructive text-xs" onClick={handleRemoveCover}>
                <X className="h-3.5 w-3.5" />
                {t("bookDetail.removeCover")}
              </Button>
            )}
          </div>

          {/* Change cover dialog */}
          <Dialog open={coverDialogOpen} onOpenChange={setCoverDialogOpen}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle className="font-serif">{t("bookDetail.changeCover")}</DialogTitle>
              </DialogHeader>
              <Tabs defaultValue="url">
                <TabsList className="w-full">
                  <TabsTrigger value="url" className="flex-1 gap-1.5"><Link2 className="h-3.5 w-3.5" />{t("bookDetail.coverTabUrl")}</TabsTrigger>
                  <TabsTrigger value="upload" className="flex-1 gap-1.5"><Camera className="h-3.5 w-3.5" />{t("bookDetail.coverTabUpload")}</TabsTrigger>
                </TabsList>
                <TabsContent value="url" className="space-y-4 pt-4">
                  <Input
                    placeholder={t("bookDetail.coverUrlPlaceholder")}
                    value={coverUrlInput}
                    onChange={(e) => setCoverUrlInput(e.target.value)}
                  />
                  {coverUrlInput && (
                    <div className="w-full aspect-[2/3] rounded-lg overflow-hidden border border-border/50">
                      <img src={coverUrlInput} alt="Preview" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    </div>
                  )}
                  <Button className="w-full rounded-full" onClick={handleSaveCoverUrl} disabled={!coverUrlInput.trim() || coverSaving}>
                    {coverSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("bookDetail.coverSave")}
                  </Button>
                </TabsContent>
                <TabsContent value="upload" className="space-y-4 pt-4">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f) }}
                  />
                  <Button variant="outline" className="w-full rounded-full gap-2" onClick={() => fileInputRef.current?.click()} disabled={coverSaving}>
                    {coverSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                    {coverSaving ? t("bookDetail.coverUploading") : t("bookDetail.coverUploadBtn")}
                  </Button>
                </TabsContent>
              </Tabs>
            </DialogContent>
          </Dialog>
          
          <div className="bg-white/50 dark:bg-black/20 rounded-xl p-4 border border-border/50 space-y-3">
            <div className="flex items-center text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5 mr-2" />
              {t("bookDetail.added")} {format(new Date(book.dateAdded), "MMM d, yyyy")}
            </div>
            {book.dateStarted && (
              <div className="flex items-center text-xs text-muted-foreground">
                <BookOpen className="h-3.5 w-3.5 mr-2" />
                {t("bookDetail.started")} {format(new Date(book.dateStarted), "MMM d, yyyy")}
              </div>
            )}
            {book.dateFinished && (
              <div className="flex items-center text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5 mr-2" />
                {t("bookDetail.finished")} {format(new Date(book.dateFinished), "MMM d, yyyy")}
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
            {statusOptions.map(status => (
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
                  {t("bookDetail.readingProgress")}
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
              <p className="text-xs text-muted-foreground text-right">{Math.round(progress)}% {t("bookDetail.complete")}</p>
            </div>
          )}

          {book.status === 'read' && (
            <div className="bg-primary/5 border border-primary/10 rounded-xl p-6 flex flex-col items-center sm:flex-row sm:justify-between gap-4">
              <h3 className="font-serif font-semibold text-lg text-primary flex items-center">
                <Star className="h-5 w-5 mr-2" />
                {t("bookDetail.yourRating")}
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
            <h3 className="font-serif font-semibold text-xl border-b border-border/50 pb-2">{t("bookDetail.notesTitle")}</h3>
            <Textarea 
              placeholder={t("bookDetail.notesPlaceholder")}
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

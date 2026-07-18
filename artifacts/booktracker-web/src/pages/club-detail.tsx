import { useState, useMemo } from "react";
import { Link, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { customFetch, useListBooks, lookupBookByIsbn } from "@workspace/api-client-react";
import type { Book } from "@workspace/api-client-react";
import { IsbnScannerDialog } from "@/components/isbn-scanner";
import {
  ArrowLeft, Copy, Check, BookOpen, Users, Plus, Trash2,
  MessageSquare, ChevronRight, BookMarked, LogOut, Loader2, Lock,
  Library, ScanBarcode, Search, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClubMember {
  id: string;
  userId: string;
  displayName: string | null;
  role: string;
  joinedAt: string;
}

interface ClubBook {
  id: string;
  title: string;
  author: string;
  coverColor: string;
  isbn: string | null;
  pages: number | null;
  genre: string | null;
  addedBy: string;
  postCount: number;
  createdAt: string;
}

interface ClubPost {
  id: string;
  userId: string;
  userDisplayName: string | null;
  content: string;
  progressPage: number | null;
  createdAt: string;
}

interface ClubDetail {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  inviteCode: string;
  hasPassword: boolean;
  members: ClubMember[];
  books: ClubBook[];
  myRole: "owner" | "member";
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

function useClub(id: string) {
  return useQuery<ClubDetail>({
    queryKey: ["club", id],
    queryFn: () => customFetch(`/api/clubs/${id}`),
    enabled: !!id,
  });
}

function usePosts(clubId: string, bookId: string | null) {
  return useQuery<ClubPost[]>({
    queryKey: ["club-posts", clubId, bookId],
    queryFn: () => customFetch(`/api/clubs/${clubId}/books/${bookId}/posts`),
    enabled: !!bookId,
  });
}

// ---------------------------------------------------------------------------
// Add Book Dialog
// ---------------------------------------------------------------------------

type AddBookMode = "manual" | "library" | "scan";

interface ClubBookPayload {
  title: string;
  author: string;
  isbn?: string | null;
  pages?: number | null;
  genre?: string | null;
}

function AddBookDialog({ clubId, open, onClose }: { clubId: string; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [mode, setMode] = useState<AddBookMode>("manual");

  // Manual entry state
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");

  // Library import state
  const [librarySearch, setLibrarySearch] = useState("");
  const { data: myBooks, isLoading: libraryLoading } = useListBooks(undefined, {
    query: { enabled: open && mode === "library" },
  } as any);

  // ISBN scan state
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scannedIsbn, setScannedIsbn] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<{
    title: string;
    author: string;
    pages: number | null;
    genre: string | null;
  } | null>(null);

  const resetAll = () => {
    setTitle("");
    setAuthor("");
    setLibrarySearch("");
    setScannerOpen(false);
    setScanLoading(false);
    setScanError(null);
    setScannedIsbn(null);
    setScanResult(null);
    setMode("manual");
  };

  const mutation = useMutation({
    mutationFn: (data: ClubBookPayload) =>
      customFetch(`/api/clubs/${clubId}/books`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["club", clubId] });
      toast({ title: t("clubDetail.addBook") + "!" });
      resetAll();
      onClose();
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const filteredLibraryBooks = useMemo(() => {
    const books = myBooks ?? [];
    const q = librarySearch.trim().toLowerCase();
    if (!q) return books;
    return books.filter(
      (b: Book) => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q),
    );
  }, [myBooks, librarySearch]);

  const handleScan = async (isbn: string) => {
    setScannerOpen(false);
    const clean = isbn.replace(/[^0-9Xx]/g, "");
    if (!clean) return;
    setScannedIsbn(clean);
    setScanResult(null);
    setScanError(null);
    setScanLoading(true);
    try {
      const result = await lookupBookByIsbn({ isbn: clean });
      setScanResult({
        title: result.title,
        author: result.author,
        pages: result.pages ?? null,
        genre: result.genre ?? null,
      });
    } catch {
      setScanError(t("clubDetail.addBookDialog.scanNotFound"));
    } finally {
      setScanLoading(false);
    }
  };

  const handleClose = () => {
    resetAll();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-serif">{t("clubDetail.addBookDialog.title")}</DialogTitle>
          <DialogDescription>{t("clubDetail.addBookDialog.description")}</DialogDescription>
        </DialogHeader>

        {/* Mode toggle */}
        <div className="inline-flex flex-wrap rounded-full border border-border p-1 bg-secondary/50 gap-1">
          <button
            type="button"
            onClick={() => setMode("manual")}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              mode === "manual" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("clubDetail.addBookDialog.modeManual")}
          </button>
          <button
            type="button"
            onClick={() => setMode("library")}
            className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              mode === "library" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Library className="h-3 w-3" />
            {t("clubDetail.addBookDialog.modeLibrary")}
          </button>
          <button
            type="button"
            onClick={() => setMode("scan")}
            className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              mode === "scan" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ScanBarcode className="h-3 w-3" />
            {t("clubDetail.addBookDialog.modeScan")}
          </button>
        </div>

        {mode === "manual" && (
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="book-title">{t("clubDetail.addBookDialog.titleLabel")}</Label>
              <Input id="book-title" placeholder={t("clubDetail.addBookDialog.titlePlaceholder")} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="book-author">{t("clubDetail.addBookDialog.authorLabel")}</Label>
              <Input id="book-author" placeholder={t("clubDetail.addBookDialog.authorPlaceholder")} value={author} onChange={(e) => setAuthor(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={handleClose}>{t("clubDetail.addBookDialog.cancel")}</Button>
              <Button
                onClick={() => mutation.mutate({ title, author })}
                disabled={!title.trim() || !author.trim() || mutation.isPending}
              >
                {mutation.isPending ? t("clubDetail.addBookDialog.adding") : t("clubDetail.addBookDialog.add")}
              </Button>
            </div>
          </div>
        )}

        {mode === "library" && (
          <div className="space-y-3 pt-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder={t("clubDetail.addBookDialog.librarySearchPlaceholder")}
                value={librarySearch}
                onChange={(e) => setLibrarySearch(e.target.value)}
              />
            </div>
            <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
              {libraryLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredLibraryBooks.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  {(myBooks ?? []).length === 0
                    ? t("clubDetail.addBookDialog.libraryEmpty")
                    : t("clubDetail.addBookDialog.libraryNoMatches")}
                </p>
              ) : (
                filteredLibraryBooks.map((b: Book) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() =>
                      mutation.mutate({
                        title: b.title,
                        author: b.author,
                        pages: b.pages ?? null,
                        genre: b.genre ?? null,
                      })
                    }
                    disabled={mutation.isPending}
                    className="w-full flex items-center justify-between gap-2 p-2.5 rounded-lg border border-border/60 hover:bg-secondary/60 transition-colors text-left disabled:opacity-50"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{b.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{b.author}</p>
                    </div>
                    <Plus className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  </button>
                ))
              )}
            </div>
            <div className="flex justify-end pt-1">
              <Button variant="outline" onClick={handleClose}>{t("clubDetail.addBookDialog.cancel")}</Button>
            </div>
          </div>
        )}

        {mode === "scan" && (
          <div className="space-y-4 pt-2">
            {!scanResult && !scanLoading && (
              <>
                <p className="text-sm text-muted-foreground">{t("clubDetail.addBookDialog.scanHint")}</p>
                <Button type="button" variant="outline" className="w-full" onClick={() => setScannerOpen(true)}>
                  <ScanBarcode className="h-4 w-4 mr-2" />
                  {t("clubDetail.addBookDialog.scanButton")}
                </Button>
                {scanError && (
                  <p className="text-xs text-destructive flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" /> {scanError}
                  </p>
                )}
              </>
            )}

            {scanLoading && (
              <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <p className="text-sm">{t("clubDetail.addBookDialog.scanLookingUp")}</p>
              </div>
            )}

            {scanResult && !scanLoading && (
              <div className="space-y-3">
                <div className="p-3 rounded-lg border border-border/60 bg-secondary/40">
                  <p className="text-sm font-medium">{scanResult.title}</p>
                  <p className="text-xs text-muted-foreground">{scanResult.author}</p>
                </div>
                <div className="flex justify-between gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setScanResult(null);
                      setScannedIsbn(null);
                      setScanError(null);
                      setScannerOpen(true);
                    }}
                  >
                    {t("clubDetail.addBookDialog.scanAgain")}
                  </Button>
                  <Button
                    onClick={() =>
                      mutation.mutate({
                        title: scanResult.title,
                        author: scanResult.author,
                        isbn: scannedIsbn,
                        pages: scanResult.pages,
                        genre: scanResult.genre,
                      })
                    }
                    disabled={mutation.isPending}
                  >
                    {mutation.isPending ? t("clubDetail.addBookDialog.adding") : t("clubDetail.addBookDialog.scanPreviewAdd")}
                  </Button>
                </div>
              </div>
            )}

            {!scanResult && (
              <div className="flex justify-end pt-1">
                <Button variant="outline" onClick={handleClose}>{t("clubDetail.addBookDialog.cancel")}</Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>

      <IsbnScannerDialog open={scannerOpen} onScan={handleScan} onClose={() => setScannerOpen(false)} />
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Add Post Dialog
// ---------------------------------------------------------------------------

function AddPostDialog({ clubId, book, open, onClose }: { clubId: string; book: ClubBook; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { user } = useUser();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [content, setContent] = useState("");
  const [progressPage, setProgressPage] = useState("");

  const displayName =
    user?.firstName || user?.username ||
    user?.emailAddresses[0]?.emailAddress?.split("@")[0] || "Reader";

  const mutation = useMutation({
    mutationFn: (data: { content: string; progressPage?: number; displayName: string }) =>
      customFetch(`/api/clubs/${clubId}/books/${book.id}/posts`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["club-posts", clubId, book.id] });
      qc.invalidateQueries({ queryKey: ["club", clubId] });
      toast({ title: t("clubDetail.postDialog.post") + "!" });
      setContent(""); setProgressPage(""); onClose();
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif">{t("clubDetail.postDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("clubDetail.postDialog.descriptionAbout")} <span className="font-medium text-foreground">{book.title}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="post-content">{t("clubDetail.postDialog.commentLabel")}</Label>
            <Textarea
              id="post-content"
              placeholder={t("clubDetail.postDialog.commentPlaceholder")}
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
          {book.pages && (
            <div className="space-y-1.5">
              <Label htmlFor="post-page">{t("clubDetail.postDialog.pageLabel")}</Label>
              <Input
                id="post-page"
                type="number"
                min={1}
                max={book.pages}
                placeholder={`1 – ${book.pages}`}
                value={progressPage}
                onChange={(e) => setProgressPage(e.target.value)}
                className="w-32"
              />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>{t("clubDetail.postDialog.cancel")}</Button>
            <Button
              onClick={() =>
                mutation.mutate({
                  content,
                  progressPage: progressPage ? parseInt(progressPage) : undefined,
                  displayName,
                })
              }
              disabled={!content.trim() || mutation.isPending}
            >
              {mutation.isPending ? t("clubDetail.postDialog.posting") : t("clubDetail.postDialog.post")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Post Item
// ---------------------------------------------------------------------------

function PostItem({
  post, isOwn, isClubOwner, onDelete,
}: {
  post: ClubPost; isOwn: boolean; isClubOwner: boolean; onDelete: () => void;
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const canDelete = isOwn || isClubOwner;

  const relativeTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t("clubDetail.justNow");
    if (mins < 60) return t("clubDetail.minutesAgo", { count: mins });
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return t("clubDetail.hoursAgo", { count: hrs });
    return t("clubDetail.daysAgo", { count: Math.floor(hrs / 24) });
  };

  return (
    <>
      <div className="flex gap-3 py-3">
        <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0 text-primary font-semibold text-sm">
          {(post.userDisplayName ?? "?").charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold truncate">
              {post.userDisplayName ?? "Member"}
            </span>
            {post.progressPage !== null && (
              <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
                p.{post.progressPage}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground ml-auto">
              {relativeTime(post.createdAt)}
            </span>
            {canDelete && (
              <button
                onClick={() => setConfirming(true)}
                className="text-muted-foreground hover:text-destructive transition-colors ml-1"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
            {post.content}
          </p>
        </div>
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("clubDetail.deletePost.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("clubDetail.deletePost.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("clubDetail.deletePost.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={onDelete}
            >
              {t("clubDetail.deletePost.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Book + Discussion Panel
// ---------------------------------------------------------------------------

function BookDiscussion({ club, book, currentUserId }: { club: ClubDetail; book: ClubBook; currentUserId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [postOpen, setPostOpen] = useState(false);
  const { data: posts, isLoading } = usePosts(club.id, book.id);

  const deleteMutation = useMutation({
    mutationFn: (postId: string) =>
      customFetch(`/api/clubs/${club.id}/books/${book.id}/posts/${postId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["club-posts", club.id, book.id] });
      qc.invalidateQueries({ queryKey: ["club", club.id] });
      toast({ title: "Post deleted" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <>
      <div className="flex items-center gap-3 p-4 bg-secondary/40 rounded-xl">
        <div
          className="w-10 h-14 rounded-md shrink-0 flex items-center justify-center"
          style={{ backgroundColor: book.coverColor }}
        >
          <span className="text-white font-bold text-lg">{book.title.charAt(0)}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-serif font-semibold leading-tight line-clamp-1">{book.title}</h3>
          <p className="text-sm text-muted-foreground line-clamp-1">{book.author}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {book.postCount} {t("clubDetail.postCount", { count: book.postCount })}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setPostOpen(true)}>
          <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
          {t("clubDetail.post")}
        </Button>
      </div>

      <div>
        {isLoading ? (
          <div className="space-y-3 pt-2">
            {[1, 2].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-4 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : posts && posts.length > 0 ? (
          <div className="divide-y divide-border/40">
            {posts.map((post) => (
              <PostItem
                key={post.id}
                post={post}
                isOwn={post.userId === currentUserId}
                isClubOwner={club.myRole === "owner"}
                onDelete={() => deleteMutation.mutate(post.id)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground text-sm">
            {t("clubDetail.noPostsYet")}
          </div>
        )}
      </div>

      <AddPostDialog clubId={club.id} book={book} open={postOpen} onClose={() => setPostOpen(false)} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ClubDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { user } = useUser();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: club, isLoading } = useClub(id ?? "");
  const [addBookOpen, setAddBookOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const copyInviteCode = () => {
    if (!club) return;
    navigator.clipboard.writeText(club.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const leaveMutation = useMutation({
    mutationFn: () =>
      customFetch(`/api/clubs/${id}/leave`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clubs"] });
      window.location.href = "/clubs";
    },
    onError: (err: Error) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => customFetch(`/api/clubs/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clubs"] });
      window.location.href = "/clubs";
    },
    onError: (err: Error) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const removeBookMutation = useMutation({
    mutationFn: (bookId: string) =>
      customFetch(`/api/clubs/${id}/books/${bookId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["club", id] });
      toast({ title: t("clubDetail.removeBook") });
    },
    onError: (err: Error) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const currentUserId = user?.id ?? "";

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-5 w-96" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  if (!club) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        {t("clubDetail.notFound")}{" "}
        <Link href="/clubs" className="text-primary underline">
          {t("clubDetail.backLink")}
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <Link
            href="/clubs"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("clubDetail.backToClubs")}
          </Link>

          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-serif text-3xl font-bold">{club.name}</h1>
                {club.myRole === "owner" && (
                  <Badge variant="secondary">{t("clubDetail.owner")}</Badge>
                )}
              </div>
              {club.description && (
                <p className="text-muted-foreground mt-1">{club.description}</p>
              )}
            </div>

            {/* Invite code + actions */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1.5 bg-secondary rounded-lg px-3 py-1.5">
                <span className="text-xs text-muted-foreground">{t("clubDetail.invite")}</span>
                <span className="font-mono text-sm font-semibold tracking-widest">
                  {club.inviteCode}
                </span>
                <button
                  onClick={copyInviteCode}
                  className="text-muted-foreground hover:text-foreground transition-colors ml-0.5"
                  title={t("clubDetail.copyInvite")}
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>

              {club.myRole !== "owner" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => setLeaveConfirm(true)}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              )}
              {club.myRole === "owner" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => setDeleteConfirm(true)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Main layout */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          {/* Left: Books + discussions */}
          <div className="md:col-span-2 space-y-8">
            <div className="flex items-center justify-between">
              <h2 className="font-serif font-semibold text-xl flex items-center gap-2">
                <BookMarked className="h-5 w-5 text-primary" />
                {t("clubDetail.readingList")}
              </h2>
              <Button size="sm" onClick={() => setAddBookOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                {t("clubDetail.addBook")}
              </Button>
            </div>

            {club.books.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-border rounded-xl text-muted-foreground text-sm">
                {t("clubDetail.noBooksYet")}
              </div>
            ) : (
              <div className="space-y-8">
                {club.books.map((book) => (
                  <div key={book.id} className="space-y-4">
                    <BookDiscussion club={club} book={book} currentUserId={currentUserId} />
                    {(club.myRole === "owner" || book.addedBy === currentUserId) && (
                      <div className="flex justify-end">
                        <button
                          onClick={() => removeBookMutation.mutate(book.id)}
                          className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors"
                        >
                          <Trash2 className="h-3 w-3" />
                          {t("clubDetail.removeBook")}
                        </button>
                      </div>
                    )}
                    <Separator />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Members */}
          <div>
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  {t("clubDetail.members")} ({club.members.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 pt-0">
                {club.members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center gap-2.5 py-1.5 px-1 rounded-lg hover:bg-secondary/50 transition-colors"
                  >
                    <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0 text-primary font-semibold text-xs">
                      {(member.displayName ?? "?").charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium flex-1 truncate">
                      {member.displayName ?? "Member"}
                    </span>
                    {member.role === "owner" && (
                      <Badge variant="secondary" className="text-[10px] py-0 px-1.5 shrink-0">
                        {t("clubDetail.owner")}
                      </Badge>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <AddBookDialog clubId={club.id} open={addBookOpen} onClose={() => setAddBookOpen(false)} />

      {/* Leave confirmation */}
      <AlertDialog open={leaveConfirm} onOpenChange={setLeaveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("clubDetail.leaveClub")}</AlertDialogTitle>
            <AlertDialogDescription>{t("clubDetail.leaveDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("clubDetail.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => leaveMutation.mutate()}
            >
              {t("clubDetail.leave")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("clubDetail.deleteClub")}</AlertDialogTitle>
            <AlertDialogDescription>{t("clubDetail.deleteDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("clubDetail.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate()}
            >
              {t("clubDetail.deleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

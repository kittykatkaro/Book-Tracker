import { useState } from "react";
import { Link, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { customFetch } from "@workspace/api-client-react";
import {
  ArrowLeft, Copy, Check, BookOpen, Users, Plus, Trash2,
  MessageSquare, ChevronRight, BookMarked, LogOut, Loader2,
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

function AddBookDialog({
  clubId,
  open,
  onClose,
}: {
  clubId: string;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");

  const mutation = useMutation({
    mutationFn: (data: { title: string; author: string }) =>
      customFetch(`/api/clubs/${clubId}/books`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["club", clubId] });
      toast({ title: "Book added to club!" });
      setTitle("");
      setAuthor("");
      onClose();
    },
    onError: (err: Error) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-serif">Add a book</DialogTitle>
          <DialogDescription>Pick the next book for your club to read.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="book-title">Title</Label>
            <Input
              id="book-title"
              placeholder="Book title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="book-author">Author</Label>
            <Input
              id="book-author"
              placeholder="Author name"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => mutation.mutate({ title, author })}
              disabled={!title.trim() || !author.trim() || mutation.isPending}
            >
              {mutation.isPending ? "Adding…" : "Add book"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Add Post Dialog
// ---------------------------------------------------------------------------

function AddPostDialog({
  clubId,
  book,
  open,
  onClose,
}: {
  clubId: string;
  book: ClubBook;
  open: boolean;
  onClose: () => void;
}) {
  const { user } = useUser();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [content, setContent] = useState("");
  const [progressPage, setProgressPage] = useState("");

  const displayName =
    user?.firstName ||
    user?.username ||
    user?.emailAddresses[0]?.emailAddress?.split("@")[0] ||
    "Reader";

  const mutation = useMutation({
    mutationFn: (data: { content: string; progressPage?: number; displayName: string }) =>
      customFetch(`/api/clubs/${clubId}/books/${book.id}/posts`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["club-posts", clubId, book.id] });
      qc.invalidateQueries({ queryKey: ["club", clubId] });
      toast({ title: "Posted!" });
      setContent("");
      setProgressPage("");
      onClose();
    },
    onError: (err: Error) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif">Share your thoughts</DialogTitle>
          <DialogDescription>
            Post about <span className="font-medium text-foreground">{book.title}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="post-content">Comment</Label>
            <Textarea
              id="post-content"
              placeholder="What are you thinking about this book?"
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
          {book.pages && (
            <div className="space-y-1.5">
              <Label htmlFor="post-page">Current page (optional)</Label>
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
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
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
              {mutation.isPending ? "Posting…" : "Post"}
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
  post,
  isOwn,
  isClubOwner,
  onDelete,
}: {
  post: ClubPost;
  isOwn: boolean;
  isClubOwner: boolean;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const canDelete = isOwn || isClubOwner;

  const relativeTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
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
                aria-label="Delete post"
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
            <AlertDialogTitle>Delete this post?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={onDelete}
            >
              Delete
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

function BookDiscussion({
  club,
  book,
  currentUserId,
}: {
  club: ClubDetail;
  book: ClubBook;
  currentUserId: string;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [postOpen, setPostOpen] = useState(false);
  const { data: posts, isLoading } = usePosts(club.id, book.id);

  const deleteMutation = useMutation({
    mutationFn: (postId: string) =>
      customFetch(`/api/clubs/${club.id}/books/${book.id}/posts/${postId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["club-posts", club.id, book.id] });
      qc.invalidateQueries({ queryKey: ["club", club.id] });
      toast({ title: "Post deleted" });
    },
    onError: (err: Error) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <>
      <div className="flex items-center gap-3 p-4 bg-secondary/40 rounded-xl">
        <div
          className="w-10 h-14 rounded-md shrink-0 flex items-center justify-center"
          style={{ backgroundColor: book.coverColor }}
        >
          <span className="text-white font-bold text-lg">
            {book.title.charAt(0)}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-serif font-semibold leading-tight line-clamp-1">
            {book.title}
          </h3>
          <p className="text-sm text-muted-foreground line-clamp-1">{book.author}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {book.postCount} {book.postCount === 1 ? "post" : "posts"}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setPostOpen(true)}>
          <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
          Post
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
            No posts yet — be the first to share your thoughts!
          </div>
        )}
      </div>

      <AddPostDialog
        clubId={club.id}
        book={book}
        open={postOpen}
        onClose={() => setPostOpen(false)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ClubDetail() {
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
      toast({ title: "Book removed" });
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
        Club not found or you're not a member.{" "}
        <Link href="/clubs" className="text-primary underline">
          Back to clubs
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
            Book Clubs
          </Link>

          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-serif text-3xl font-bold">{club.name}</h1>
                {club.myRole === "owner" && (
                  <Badge variant="secondary">Owner</Badge>
                )}
              </div>
              {club.description && (
                <p className="text-muted-foreground mt-1">{club.description}</p>
              )}
            </div>

            {/* Invite code + actions */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1.5 bg-secondary rounded-lg px-3 py-1.5">
                <span className="text-xs text-muted-foreground">Invite:</span>
                <span className="font-mono text-sm font-semibold tracking-widest">
                  {club.inviteCode}
                </span>
                <button
                  onClick={copyInviteCode}
                  className="text-muted-foreground hover:text-foreground transition-colors ml-0.5"
                  title="Copy invite code"
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
                Reading list
              </h2>
              <Button size="sm" onClick={() => setAddBookOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                Add book
              </Button>
            </div>

            {club.books.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-border rounded-xl text-muted-foreground text-sm">
                No books yet. Add the first book for your club!
              </div>
            ) : (
              <div className="space-y-8">
                {club.books.map((book) => (
                  <div key={book.id} className="space-y-4">
                    <BookDiscussion
                      club={club}
                      book={book}
                      currentUserId={currentUserId}
                    />
                    {(club.myRole === "owner" || book.addedBy === currentUserId) && (
                      <div className="flex justify-end">
                        <button
                          onClick={() => removeBookMutation.mutate(book.id)}
                          className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors"
                        >
                          <Trash2 className="h-3 w-3" />
                          Remove book
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
                  Members ({club.members.length})
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
                        Owner
                      </Badge>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <AddBookDialog
        clubId={club.id}
        open={addBookOpen}
        onClose={() => setAddBookOpen(false)}
      />

      {/* Leave confirmation */}
      <AlertDialog open={leaveConfirm} onOpenChange={setLeaveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave this club?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll need a new invite code to rejoin.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => leaveMutation.mutate()}
            >
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this club?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the club, all books, and all discussions.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate()}
            >
              Delete club
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

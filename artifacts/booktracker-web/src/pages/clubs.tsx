import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { customFetch } from "@workspace/api-client-react";
import { Plus, Users, BookOpen, LogIn, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClubSummary {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  inviteCode: string;
  hasPassword: boolean;
  memberCount: number;
  bookCount: number;
  latestBook: { title: string; author: string; coverColor: string } | null;
  myRole: "owner" | "member";
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

function useClubs() {
  return useQuery<ClubSummary[]>({
    queryKey: ["clubs"],
    queryFn: () => customFetch("/api/clubs"),
  });
}

// ---------------------------------------------------------------------------
// Create Dialog
// ---------------------------------------------------------------------------

function CreateClubDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { user } = useUser();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const mutation = useMutation({
    mutationFn: (data: { name: string; description: string; displayName: string; password?: string }) =>
      customFetch("/api/clubs", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clubs"] });
      toast({ title: "Club created!" });
      setName(""); setDescription(""); setPassword(""); setPasswordEnabled(false);
      onClose();
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const displayName =
    user?.firstName ||
    user?.username ||
    user?.emailAddresses[0]?.emailAddress?.split("@")[0] ||
    "Reader";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif">Start a book club</DialogTitle>
          <DialogDescription>
            Create a space for your group to read and discuss together.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="club-name">Club name</Label>
            <Input
              id="club-name"
              placeholder="e.g. Sunday Readers"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="club-desc">Description (optional)</Label>
            <Textarea
              id="club-desc"
              placeholder="What's this club about?"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Password toggle */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => { setPasswordEnabled(!passwordEnabled); setPassword(""); }}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${passwordEnabled ? "bg-primary border-primary" : "border-input"}`}>
                {passwordEnabled && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10"><path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </div>
              <Lock className="h-3.5 w-3.5" />
              Password-protect this club
            </button>

            {passwordEnabled && (
              <div className="space-y-1.5">
                <Label htmlFor="club-password">Club password</Label>
                <div className="relative">
                  <Input
                    id="club-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Members will need this to join"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Share this password with people you invite — they'll need it along with the invite code.
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                mutation.mutate({ name, description, displayName, password: passwordEnabled ? password : undefined })
              }
              disabled={!name.trim() || (passwordEnabled && !password.trim()) || mutation.isPending}
            >
              {mutation.isPending ? "Creating…" : "Create club"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Join Dialog
// ---------------------------------------------------------------------------

function JoinClubDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { user } = useUser();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const mutation = useMutation({
    mutationFn: (data: { inviteCode: string; displayName: string; password?: string }) =>
      customFetch("/api/clubs/join", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clubs"] });
      toast({ title: "Joined!" });
      setCode(""); setPassword("");
      onClose();
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const displayName =
    user?.firstName ||
    user?.username ||
    user?.emailAddresses[0]?.emailAddress?.split("@")[0] ||
    "Reader";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-serif">Join a book club</DialogTitle>
          <DialogDescription>
            Enter the invite code and password (if required) shared by a club member.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="invite-code">Invite code</Label>
            <Input
              id="invite-code"
              placeholder="e.g. ABCD1234"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="font-mono tracking-widest"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="join-password" className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" />
              Password <span className="text-muted-foreground font-normal">(if required)</span>
            </Label>
            <div className="relative">
              <Input
                id="join-password"
                type={showPassword ? "text" : "password"}
                placeholder="Leave blank if no password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => mutation.mutate({ inviteCode: code, displayName, password: password || undefined })}
              disabled={!code.trim() || mutation.isPending}
            >
              {mutation.isPending ? "Joining…" : "Join club"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Club Card
// ---------------------------------------------------------------------------

function ClubCard({ club }: { club: ClubSummary }) {
  return (
    <Link href={`/clubs/${club.id}`}>
      <Card className="h-full hover:shadow-md transition-shadow cursor-pointer border-border/50">
        <CardContent className="p-5 flex flex-col gap-3 h-full">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-serif font-bold text-lg leading-tight line-clamp-2">
              {club.name}
            </h3>
            <div className="flex items-center gap-1.5 shrink-0">
              {club.hasPassword && (
                <span title="Password protected">
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                </span>
              )}
              {club.myRole === "owner" && (
                <Badge variant="secondary" className="text-xs">
                  Owner
                </Badge>
              )}
            </div>
          </div>

          {club.description && (
            <p className="text-sm text-muted-foreground line-clamp-2 flex-1">
              {club.description}
            </p>
          )}

          {club.latestBook && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div
                className="w-6 h-8 rounded-sm shrink-0 flex items-center justify-center"
                style={{ backgroundColor: club.latestBook.coverColor }}
              >
                <span className="text-white text-[9px] font-bold">
                  {club.latestBook.title.charAt(0)}
                </span>
              </div>
              <span className="line-clamp-1 font-medium text-foreground">
                {club.latestBook.title}
              </span>
            </div>
          )}

          <div className="flex items-center gap-4 text-xs text-muted-foreground mt-auto pt-1 border-t border-border/40">
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {club.memberCount} {club.memberCount === 1 ? "member" : "members"}
            </span>
            <span className="flex items-center gap-1">
              <BookOpen className="h-3.5 w-3.5" />
              {club.bookCount} {club.bookCount === 1 ? "book" : "books"}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

function EmptyState({ onCreate, onJoin }: { onCreate: () => void; onJoin: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
        <Users className="h-8 w-8 text-primary" />
      </div>
      <div className="space-y-1">
        <h3 className="font-serif font-semibold text-xl">No book clubs yet</h3>
        <p className="text-muted-foreground text-sm max-w-xs">
          Create a club to read with friends, or join one with an invite code.
        </p>
      </div>
      <div className="flex gap-2">
        <Button onClick={onCreate}>
          <Plus className="h-4 w-4 mr-1.5" />
          Create club
        </Button>
        <Button variant="outline" onClick={onJoin}>
          <LogIn className="h-4 w-4 mr-1.5" />
          Join club
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function Clubs() {
  const { data: clubs, isLoading } = useClubs();
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  return (
    <>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-3xl font-bold">Book Clubs</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Read and discuss books with your community.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setJoinOpen(true)}>
              <LogIn className="h-4 w-4 mr-1.5" />
              Join
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              New club
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-5 space-y-3">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : clubs && clubs.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {clubs.map((club) => (
              <ClubCard key={club.id} club={club} />
            ))}
          </div>
        ) : (
          <EmptyState onCreate={() => setCreateOpen(true)} onJoin={() => setJoinOpen(true)} />
        )}
      </div>

      <CreateClubDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <JoinClubDialog open={joinOpen} onClose={() => setJoinOpen(false)} />
    </>
  );
}

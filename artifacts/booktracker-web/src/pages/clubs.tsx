import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { customFetch } from "@workspace/api-client-react";
import { Plus, Users, BookOpen, LogIn, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";

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

function useClubs() {
  return useQuery<ClubSummary[]>({
    queryKey: ["clubs"],
    queryFn: () => customFetch("/api/clubs"),
  });
}

function CreateClubDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { user } = useUser();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const mutation = useMutation({
    mutationFn: (data: { name: string; description: string; displayName: string; password: string }) =>
      customFetch("/api/clubs", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clubs"] });
      toast({ title: t("clubs.createDialog.create") + "!" });
      setName(""); setDescription(""); setPassword("");
      onClose();
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const displayName =
    user?.firstName || user?.username ||
    user?.emailAddresses[0]?.emailAddress?.split("@")[0] || "Reader";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif">{t("clubs.createDialog.title")}</DialogTitle>
          <DialogDescription>{t("clubs.createDialog.description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="club-name">{t("clubs.createDialog.nameLabel")}</Label>
            <Input id="club-name" placeholder={t("clubs.createDialog.namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="club-desc">{t("clubs.createDialog.descLabel")}</Label>
            <Textarea id="club-desc" placeholder={t("clubs.createDialog.descPlaceholder")} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="club-password" className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" />
              {t("clubs.createDialog.passwordLabel")}
            </Label>
            <div className="relative">
              <Input
                id="club-password"
                type={showPassword ? "text" : "password"}
                placeholder={t("clubs.createDialog.passwordPlaceholder")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
              >
                {showPassword ? t("clubs.createDialog.hide") : t("clubs.createDialog.show")}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">{t("clubs.createDialog.passwordHint")}</p>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>{t("clubs.createDialog.cancel")}</Button>
            <Button
              onClick={() => mutation.mutate({ name, description, displayName, password })}
              disabled={!name.trim() || !password.trim() || mutation.isPending}
            >
              {mutation.isPending ? t("clubs.createDialog.creating") : t("clubs.createDialog.create")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function JoinClubDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { user } = useUser();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const mutation = useMutation({
    mutationFn: (data: { inviteCode: string; displayName: string; password?: string }) =>
      customFetch("/api/clubs/join", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clubs"] });
      toast({ title: t("clubs.joinDialog.join") + "!" });
      setCode(""); setPassword("");
      onClose();
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const displayName =
    user?.firstName || user?.username ||
    user?.emailAddresses[0]?.emailAddress?.split("@")[0] || "Reader";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-serif">{t("clubs.joinDialog.title")}</DialogTitle>
          <DialogDescription>{t("clubs.joinDialog.description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="invite-code">{t("clubs.joinDialog.codeLabel")}</Label>
            <Input
              id="invite-code"
              placeholder={t("clubs.joinDialog.codePlaceholder")}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="font-mono tracking-widest"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="join-password" className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" />
              {t("clubs.joinDialog.passwordLabel")}
            </Label>
            <div className="relative">
              <Input
                id="join-password"
                type={showPassword ? "text" : "password"}
                placeholder={t("clubs.joinDialog.passwordPlaceholder")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
              >
                {showPassword ? t("clubs.joinDialog.hide") : t("clubs.joinDialog.show")}
              </button>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>{t("clubs.joinDialog.cancel")}</Button>
            <Button
              onClick={() => mutation.mutate({ inviteCode: code, displayName, password })}
              disabled={!code.trim() || !password.trim() || mutation.isPending}
            >
              {mutation.isPending ? t("clubs.joinDialog.joining") : t("clubs.joinDialog.join")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ClubCard({ club }: { club: ClubSummary }) {
  const { t } = useTranslation();
  return (
    <Link href={`/clubs/${club.id}`}>
      <Card className="h-full hover:shadow-md transition-shadow cursor-pointer border-border/50">
        <CardContent className="p-5 flex flex-col gap-3 h-full">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-serif font-bold text-lg leading-tight line-clamp-2">{club.name}</h3>
            {club.myRole === "owner" && (
              <Badge variant="secondary" className="text-xs shrink-0">{t("clubs.owner")}</Badge>
            )}
          </div>
          {club.description && (
            <p className="text-sm text-muted-foreground line-clamp-2 flex-1">{club.description}</p>
          )}
          {club.latestBook && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="w-6 h-8 rounded-sm shrink-0 flex items-center justify-center" style={{ backgroundColor: club.latestBook.coverColor }}>
                <span className="text-white text-[9px] font-bold">{club.latestBook.title.charAt(0)}</span>
              </div>
              <span className="line-clamp-1 font-medium text-foreground">{club.latestBook.title}</span>
            </div>
          )}
          <div className="flex items-center gap-4 text-xs text-muted-foreground mt-auto pt-1 border-t border-border/40">
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {t("clubs.member", { count: club.memberCount })}
            </span>
            <span className="flex items-center gap-1">
              <BookOpen className="h-3.5 w-3.5" />
              {t("clubs.bookCount", { count: club.bookCount })}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function EmptyState({ onCreate, onJoin }: { onCreate: () => void; onJoin: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
        <Users className="h-8 w-8 text-primary" />
      </div>
      <div className="space-y-1">
        <h3 className="font-serif font-semibold text-xl">{t("clubs.emptyTitle")}</h3>
        <p className="text-muted-foreground text-sm max-w-xs">{t("clubs.emptySub")}</p>
      </div>
      <div className="flex gap-2">
        <Button onClick={onCreate}>
          <Plus className="h-4 w-4 mr-1.5" />
          {t("clubs.createClub")}
        </Button>
        <Button variant="outline" onClick={onJoin}>
          <LogIn className="h-4 w-4 mr-1.5" />
          {t("clubs.joinClub")}
        </Button>
      </div>
    </div>
  );
}

export function Clubs() {
  const { t } = useTranslation();
  const { data: clubs, isLoading } = useClubs();
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  return (
    <>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-3xl font-bold">{t("clubs.title")}</h1>
            <p className="text-muted-foreground mt-1 text-sm">{t("clubs.subtitle")}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setJoinOpen(true)}>
              <LogIn className="h-4 w-4 mr-1.5" />
              {t("clubs.join")}
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              {t("clubs.newClub")}
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
            {clubs.map((club) => <ClubCard key={club.id} club={club} />)}
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

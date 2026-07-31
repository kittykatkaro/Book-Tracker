import { useState } from "react";
import { useCreateBook, getListBooksQueryKey, lookupBookByIsbn, GENRES } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, BookPlus, ScanBarcode, Search, Loader2, CheckCircle, AlertCircle, Layers } from "lucide-react";
import { Link } from "wouter";
import { IsbnScannerDialog } from "@/components/isbn-scanner";
import { IsbnSetImport } from "@/components/isbn-set-import";

type Mode = "single" | "set";

const NO_GENRE = "__none__";

export function AddBook() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createBook = useCreateBook();
  const [mode, setMode] = useState<Mode>("single");

  const formSchema = z.object({
    title: z.string().min(1, t("addBook.titleRequired")),
    author: z.string().min(1, t("addBook.authorRequired")),
    status: z.enum(["reading", "read", "want_to_read"]),
    pages: z.coerce.number().min(1).optional().or(z.literal("")),
    genre: z.string().optional(),
  });

  const [isbnInput, setIsbnInput] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupStatus, setLookupStatus] = useState<"idle" | "success" | "error">("idle");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [lookedUpCoverUrl, setLookedUpCoverUrl] = useState<string | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      author: "",
      status: "want_to_read",
      pages: "",
      genre: "",
    },
  });

  const handleLookup = async (isbn: string) => {
    const clean = isbn.replace(/[^0-9Xx]/g, "");
    if (!clean || clean.length < 10) return;
    setLookupLoading(true);
    setLookupStatus("idle");
    try {
      const result = await lookupBookByIsbn({ isbn: clean });
      if (result.title) form.setValue("title", result.title, { shouldValidate: true });
      if (result.author) form.setValue("author", result.author, { shouldValidate: true });
      if (result.pages) form.setValue("pages", result.pages as number, { shouldValidate: true });
      if (result.genre) form.setValue("genre", result.genre, { shouldValidate: true });
      setLookedUpCoverUrl(result.coverUrl ?? null);
      setLookupStatus("success");
    } catch {
      setLookupStatus("error");
    } finally {
      setLookupLoading(false);
    }
  };

  const handleScan = (isbn: string) => {
    setIsbnInput(isbn);
    setScannerOpen(false);
    handleLookup(isbn);
  };

  function onSubmit(values: z.infer<typeof formSchema>) {
    createBook.mutate(
      {
        data: {
          title: values.title,
          author: values.author,
          status: values.status,
          pages: values.pages === "" ? null : (values.pages as number),
          genre: values.genre || null,
          coverUrl: lookedUpCoverUrl ?? null,
          isbn: isbnInput.replace(/[^0-9Xx]/g, "") || null,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListBooksQueryKey() });
          setLocation("/");
        },
        onError: (err: any) => {
          const isDuplicate = err?.status === 409;
          toast({
            title: isDuplicate
              ? t("addBook.errorDuplicateTitle")
              : (t("addBook.errorAddFailed") ?? "Couldn't add book"),
            description: isDuplicate
              ? (err?.data?.message ?? t("addBook.errorDuplicateDesc"))
              : (err?.message ?? "Something went wrong. Please try again."),
            variant: "destructive",
          });
        },
      },
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Link
        href="/"
        className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
        data-testid="link-back-library"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        {t("addBook.backToLibrary")}
      </Link>

      <Card className="border-none shadow-xl shadow-black/5 bg-white/80 dark:bg-black/40 backdrop-blur-sm">
        <CardHeader className="text-center pb-6 border-b border-border/50">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <BookPlus className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-3xl font-serif">{t("addBook.title")}</CardTitle>
          <p className="text-muted-foreground mt-2 font-sans">
            {t("addBook.subtitle")}
          </p>

          {/* Mode toggle */}
          <div className="flex justify-center mt-4">
            <div className="inline-flex rounded-full border border-border p-1 bg-secondary/50 gap-1">
              <button
                type="button"
                onClick={() => setMode("single")}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  mode === "single"
                    ? "bg-background shadow text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("addBook.modeSingle")}
              </button>
              <button
                type="button"
                onClick={() => setMode("set")}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  mode === "set"
                    ? "bg-background shadow text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                {t("addBook.modeSet")}
              </button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-8">
          {mode === "set" ? (
            <IsbnSetImport />
          ) : (
            <>
              {/* ISBN Lookup */}
              <div className="mb-8 p-4 rounded-xl bg-secondary/50 border border-border/40 space-y-3">
                <p className="text-sm font-medium text-foreground flex items-center gap-2">
                  <ScanBarcode className="h-4 w-4 text-primary" />
                  {t("addBook.isbnLabel")}
                </p>
                <div className="flex gap-2">
                  <Input
                    value={isbnInput}
                    onChange={(e) => {
                      setIsbnInput(e.target.value);
                      setLookupStatus("idle");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleLookup(isbnInput)}
                    placeholder={t("addBook.isbnPlaceholder")}
                    className="font-mono text-sm"
                    data-testid="input-isbn"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleLookup(isbnInput)}
                    disabled={lookupLoading || isbnInput.replace(/[^0-9Xx]/g, "").length < 10}
                    data-testid="button-lookup-isbn"
                  >
                    {lookupLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setScannerOpen(true)}
                    data-testid="button-scan-isbn"
                    title={t("addBook.scanHint")}
                  >
                    <ScanBarcode className="h-4 w-4" />
                  </Button>
                </div>

                {lookupStatus === "success" && (
                  <p className="text-xs text-green-700 dark:text-green-400 flex items-center gap-1" data-testid="text-lookup-success">
                    <CheckCircle className="h-3 w-3" /> {t("addBook.isbnSuccess")}
                  </p>
                )}
                {lookupStatus === "error" && (
                  <p className="text-xs text-destructive flex items-center gap-1" data-testid="text-lookup-error">
                    <AlertCircle className="h-3 w-3" /> {t("addBook.isbnError")}
                  </p>
                )}
                {lookupStatus === "idle" && (
                  <p className="text-xs text-muted-foreground">
                    {t("addBook.isbnHint")}
                  </p>
                )}
              </div>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-serif text-base">{t("addBook.fieldTitle")}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t("addBook.titlePlaceholder")}
                            className="text-lg py-6"
                            data-testid="input-title"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="author"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-serif text-base">{t("addBook.fieldAuthor")}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t("addBook.authorPlaceholder")}
                            data-testid="input-author"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-serif text-base">{t("addBook.fieldStatus")}</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-status">
                                <SelectValue placeholder={t("addBook.selectStatus")} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="want_to_read" data-testid="option-want-to-read">
                                {t("addBook.statusWantToRead")}
                              </SelectItem>
                              <SelectItem value="reading" data-testid="option-reading">
                                {t("addBook.statusReading")}
                              </SelectItem>
                              <SelectItem value="read" data-testid="option-read">
                                {t("addBook.statusRead")}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="genre"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-serif text-base">
                            {t("addBook.fieldGenre")}{" "}
                            <span className="text-muted-foreground font-sans text-xs font-normal">
                              {t("addBook.optional")}
                            </span>
                          </FormLabel>
                          <Select
                            onValueChange={(v) => field.onChange(v === NO_GENRE ? "" : v)}
                            value={field.value || NO_GENRE}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-genre">
                                <SelectValue placeholder={t("addBook.selectGenre")} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value={NO_GENRE} data-testid="option-genre-none">
                                {t("addBook.genreNone")}
                              </SelectItem>
                              {GENRES.map((g) => (
                                <SelectItem
                                  key={g}
                                  value={g}
                                  data-testid={`option-genre-${g.toLowerCase()}`}
                                >
                                  {g}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="pages"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-serif text-base">
                          {t("addBook.fieldPageCount")}{" "}
                          <span className="text-muted-foreground font-sans text-xs font-normal">
                            {t("addBook.optional")}
                          </span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder={t("addBook.pagesPlaceholder")}
                            data-testid="input-pages"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="pt-4 flex justify-end">
                    <Button
                      type="submit"
                      size="lg"
                      className="rounded-full px-8 font-serif"
                      disabled={createBook.isPending}
                      data-testid="button-submit-book"
                    >
                      {createBook.isPending ? t("addBook.addingBook") : t("addBook.submit")}
                    </Button>
                  </div>
                </form>
              </Form>
            </>
          )}
        </CardContent>
      </Card>

      <IsbnScannerDialog
        open={scannerOpen}
        onScan={handleScan}
        onClose={() => setScannerOpen(false)}
      />
    </div>
  );
}

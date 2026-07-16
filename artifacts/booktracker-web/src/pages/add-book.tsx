import { useState } from "react";
import { useCreateBook, getListBooksQueryKey, lookupBookByIsbn } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";

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
import { ArrowLeft, BookPlus, ScanBarcode, Search, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { IsbnScannerDialog } from "@/components/isbn-scanner";

const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  author: z.string().min(1, "Author is required"),
  status: z.enum(["reading", "read", "want_to_read"]),
  pages: z.coerce.number().min(1).optional().or(z.literal("")),
  genre: z.string().optional(),
});

export function AddBook() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const createBook = useCreateBook();

  const [isbnInput, setIsbnInput] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupStatus, setLookupStatus] = useState<"idle" | "success" | "error">("idle");
  const [scannerOpen, setScannerOpen] = useState(false);

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
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListBooksQueryKey() });
          setLocation("/");
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
        Back to Library
      </Link>

      <Card className="border-none shadow-xl shadow-black/5 bg-white/80 dark:bg-black/40 backdrop-blur-sm">
        <CardHeader className="text-center pb-8 border-b border-border/50">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <BookPlus className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-3xl font-serif">Add to Library</CardTitle>
          <p className="text-muted-foreground mt-2 font-sans">
            Document a new book on your reading journey.
          </p>
        </CardHeader>

        <CardContent className="pt-8">
          {/* ISBN Lookup */}
          <div className="mb-8 p-4 rounded-xl bg-secondary/50 border border-border/40 space-y-3">
            <p className="text-sm font-medium text-foreground flex items-center gap-2">
              <ScanBarcode className="h-4 w-4 text-primary" />
              Auto-fill from ISBN
            </p>
            <div className="flex gap-2">
              <Input
                value={isbnInput}
                onChange={(e) => {
                  setIsbnInput(e.target.value);
                  setLookupStatus("idle");
                }}
                onKeyDown={(e) => e.key === "Enter" && handleLookup(isbnInput)}
                placeholder="e.g. 9780140449136"
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
                title="Scan barcode with camera"
              >
                <ScanBarcode className="h-4 w-4" />
              </Button>
            </div>

            {lookupStatus === "success" && (
              <p className="text-xs text-green-700 dark:text-green-400 flex items-center gap-1" data-testid="text-lookup-success">
                <CheckCircle className="h-3 w-3" /> Book details filled in — review and save.
              </p>
            )}
            {lookupStatus === "error" && (
              <p className="text-xs text-destructive flex items-center gap-1" data-testid="text-lookup-error">
                <AlertCircle className="h-3 w-3" /> Book not found for this ISBN. Enter details manually.
              </p>
            )}
            {lookupStatus === "idle" && (
              <p className="text-xs text-muted-foreground">
                Enter an ISBN or scan the barcode on the back cover to auto-fill title, author and page count.
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
                    <FormLabel className="font-serif text-base">Title</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. The Secret History"
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
                    <FormLabel className="font-serif text-base">Author</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. Donna Tartt"
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
                      <FormLabel className="font-serif text-base">Status</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-status">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="want_to_read" data-testid="option-want-to-read">
                            Want to Read
                          </SelectItem>
                          <SelectItem value="reading" data-testid="option-reading">
                            Currently Reading
                          </SelectItem>
                          <SelectItem value="read" data-testid="option-read">
                            Read
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
                        Genre{" "}
                        <span className="text-muted-foreground font-sans text-xs font-normal">
                          (Optional)
                        </span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. Fiction, Fantasy"
                          data-testid="input-genre"
                          {...field}
                        />
                      </FormControl>
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
                      Page Count{" "}
                      <span className="text-muted-foreground font-sans text-xs font-normal">
                        (Optional)
                      </span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="e.g. 544"
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
                  {createBook.isPending ? "Adding…" : "Add Book"}
                </Button>
              </div>
            </form>
          </Form>
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

import { useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getListBooksQueryKey } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Upload, FileText, BookOpen, Check, ExternalLink, Loader2,
  ChevronRight, TriangleAlert,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParsedBook {
  title: string;
  author: string;
  status: "reading" | "read" | "want_to_read";
  rating?: number;
  pages?: number;
  genre?: string;
  dateRead?: string;
  source: "goodreads" | "csv" | "pdf" | "docx";
}

interface SelectableBook extends ParsedBook {
  selected: boolean;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const SOURCE_BADGE: Record<string, string> = {
  goodreads: "bg-amber-100 text-amber-800",
  csv: "bg-blue-100 text-blue-800",
  pdf: "bg-red-100 text-red-800",
  docx: "bg-purple-100 text-purple-800",
};

function StatusLabel({ status }: { status: ParsedBook["status"] }) {
  if (status === "read") return <span className="text-green-700 text-xs">Read</span>;
  if (status === "reading") return <span className="text-blue-700 text-xs">Reading</span>;
  return <span className="text-muted-foreground text-xs">Want to Read</span>;
}

// ---------------------------------------------------------------------------
// Main dialog
// ---------------------------------------------------------------------------

export function ImportBooksDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"upload" | "preview" | "importing">("upload");
  const [dragging, setDragging] = useState(false);
  const [books, setBooks] = useState<SelectableBook[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);

  const reset = () => {
    setStep("upload");
    setBooks([]);
    setParseError(null);
    setParsing(false);
    setDragging(false);
  };

  const handleClose = () => { reset(); onClose(); };

  // ---- Upload + parse ----
  const handleFile = useCallback(async (file: File) => {
    const MAX = 5 * 1024 * 1024;
    if (file.size > MAX) {
      setParseError("File is too large. Maximum size is 5 MB.");
      return;
    }
    setParseError(null);
    setParsing(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/books/import/parse", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Parse failed");
      if (!data.books || data.books.length === 0) {
        setParseError("No books detected in this file. Try a different format or check the file content.");
        setParsing(false);
        return;
      }
      setBooks(data.books.map((b: ParsedBook) => ({ ...b, selected: true })));
      setStep("preview");
    } catch (err: any) {
      setParseError(err?.message ?? "Failed to parse file");
    } finally {
      setParsing(false);
    }
  }, []);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  // ---- Selection ----
  const toggleAll = (val: boolean) =>
    setBooks((bs) => bs.map((b) => ({ ...b, selected: val })));
  const toggleOne = (i: number) =>
    setBooks((bs) => bs.map((b, j) => (j === i ? { ...b, selected: !b.selected } : b)));

  const selectedCount = books.filter((b) => b.selected).length;

  // ---- Confirm ----
  const confirm = async () => {
    const selected = books.filter((b) => b.selected);
    if (!selected.length) return;
    setStep("importing");
    try {
      const res = await fetch("/api/books/import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ books: selected }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      await qc.invalidateQueries({ queryKey: getListBooksQueryKey() });
      toast({
        title: `Imported ${data.imported} book${data.imported !== 1 ? "s" : ""}`,
        description: data.skipped
          ? `${data.skipped} skipped (already in your library)`
          : "All books added to your library.",
      });
      handleClose();
    } catch (err: any) {
      toast({ title: "Import failed", description: err?.message, variant: "destructive" });
      setStep("preview");
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">
            {step === "upload" && "Import your library"}
            {step === "preview" && `Review ${books.length} detected book${books.length !== 1 ? "s" : ""}`}
            {step === "importing" && "Importing…"}
          </DialogTitle>
          <DialogDescription>
            {step === "upload" && "Upload a file to add multiple books at once."}
            {step === "preview" && "Select which books to add. Duplicates will be skipped automatically."}
            {step === "importing" && "Adding books to your library, please wait."}
          </DialogDescription>
        </DialogHeader>

        {/* ---- Step 1: Upload ---- */}
        {step === "upload" && (
          <div className="space-y-5 py-1 overflow-y-auto">
            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              className={`
                relative flex flex-col items-center justify-center gap-3
                border-2 border-dashed rounded-xl p-10 cursor-pointer transition-colors
                ${dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-secondary/30"}
              `}
            >
              {parsing ? (
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
              ) : (
                <Upload className="h-8 w-8 text-muted-foreground" />
              )}
              <div className="text-center">
                <p className="font-medium">
                  {parsing ? "Parsing file…" : "Drop a file here or click to browse"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  CSV, PDF, DOCX — up to 5 MB
                </p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.pdf,.docx,.doc,.txt"
                onChange={onInputChange}
                className="sr-only"
              />
            </div>

            {parseError && (
              <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-lg p-3">
                <TriangleAlert className="h-4 w-4 shrink-0 mt-0.5" />
                {parseError}
              </div>
            )}

            {/* Format guide */}
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Supported formats</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  {
                    icon: <FileText className="h-4 w-4 text-amber-600" />,
                    label: "Goodreads CSV",
                    desc: "Full field mapping — rating, pages, shelf, read date",
                    badge: "Best",
                  },
                  {
                    icon: <FileText className="h-4 w-4 text-blue-600" />,
                    label: "Any CSV",
                    desc: "Title + Author columns, optional status and pages",
                  },
                  {
                    icon: <FileText className="h-4 w-4 text-muted-foreground" />,
                    label: "PDF / DOCX",
                    desc: 'Reading lists formatted as "Title – Author" or "Title by Author"',
                  },
                ].map((f) => (
                  <div key={f.label} className="flex gap-2.5 p-3 rounded-lg border bg-card">
                    <div className="mt-0.5">{f.icon}</div>
                    <div>
                      <p className="text-sm font-medium flex items-center gap-1.5">
                        {f.label}
                        {f.badge && (
                          <span className="text-[10px] font-semibold bg-amber-100 text-amber-800 rounded px-1.5 py-0.5">
                            {f.badge}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Kindle / Goodreads instructions */}
            <div className="rounded-xl border bg-amber-50 dark:bg-amber-950/20 p-4 space-y-2">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Importing your Kindle library
              </p>
              <p className="text-sm text-amber-800 dark:text-amber-300">
                Amazon doesn't provide a public Kindle API, but your reading history syncs to Goodreads. Export from there:
              </p>
              <ol className="text-sm text-amber-800 dark:text-amber-300 space-y-1 list-decimal list-inside">
                <li>Go to <strong>goodreads.com</strong> and sign in (link your Amazon/Kindle account if you haven't)</li>
                <li>Open <strong>My Books</strong> → <strong>Tools</strong> → <strong>Import and Export</strong></li>
                <li>Click <strong>Export Library</strong> — you'll download a CSV file</li>
                <li>Upload that file here</li>
              </ol>
              <a
                href="https://www.goodreads.com/review/import"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400 underline underline-offset-2 hover:no-underline"
              >
                Open Goodreads Export <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        )}

        {/* ---- Step 2: Preview ---- */}
        {step === "preview" && (
          <div className="flex flex-col min-h-0 gap-3">
            {/* Toolbar */}
            <div className="flex items-center justify-between text-sm shrink-0">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleAll(true)}
                  className="text-primary hover:underline font-medium"
                >
                  Select all
                </button>
                <button
                  onClick={() => toggleAll(false)}
                  className="text-muted-foreground hover:underline"
                >
                  None
                </button>
              </div>
              <span className="text-muted-foreground">
                {selectedCount} of {books.length} selected
              </span>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-y-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                  <tr>
                    <th className="w-8 p-2 text-left"></th>
                    <th className="p-2 text-left font-medium text-muted-foreground">Title</th>
                    <th className="p-2 text-left font-medium text-muted-foreground hidden sm:table-cell">Author</th>
                    <th className="p-2 text-left font-medium text-muted-foreground hidden md:table-cell">Status</th>
                    <th className="p-2 text-left font-medium text-muted-foreground hidden lg:table-cell">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {books.map((book, i) => (
                    <tr
                      key={i}
                      className={`border-t cursor-pointer transition-colors ${book.selected ? "bg-primary/4 hover:bg-primary/8" : "opacity-50 hover:bg-muted/30"}`}
                      onClick={() => toggleOne(i)}
                    >
                      <td className="p-2">
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${book.selected ? "bg-primary border-primary" : "border-input bg-background"}`}>
                          {book.selected && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                        </div>
                      </td>
                      <td className="p-2 font-medium max-w-[180px]">
                        <span className="truncate block">{book.title}</span>
                        <span className="text-muted-foreground font-normal text-xs sm:hidden">{book.author}</span>
                      </td>
                      <td className="p-2 text-muted-foreground hidden sm:table-cell max-w-[140px]">
                        <span className="truncate block">{book.author}</span>
                      </td>
                      <td className="p-2 hidden md:table-cell">
                        <StatusLabel status={book.status} />
                      </td>
                      <td className="p-2 hidden lg:table-cell">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium capitalize ${SOURCE_BADGE[book.source] ?? ""}`}>
                          {book.source}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Actions */}
            <div className="flex justify-between items-center shrink-0 pt-1">
              <Button variant="ghost" onClick={() => setStep("upload")}>
                ← Back
              </Button>
              <Button
                onClick={confirm}
                disabled={selectedCount === 0}
                className="gap-1.5"
              >
                Import {selectedCount} book{selectedCount !== 1 ? "s" : ""}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ---- Step 3: Importing ---- */}
        {step === "importing" && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <p className="text-muted-foreground">Adding {selectedCount} books to your library…</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useCreateBook, getListBooksQueryKey } from "@workspace/api-client-react";
import { bulkLookupIsbn } from "@workspace/api-client-react";
import type { IsbnBulkEntry } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Search,
  ScanBarcode,
  CheckCircle,
  AlertCircle,
  BookOpen,
  BookMarked,
  Check,
  X,
} from "lucide-react";
import { IsbnScannerDialog } from "@/components/isbn-scanner";
import { cn } from "@/lib/utils";

type BookStatus = "want_to_read" | "reading" | "read";

interface BookEntry extends IsbnBulkEntry {
  selectedStatus: BookStatus;
  selected: boolean;
  coverUrl?: string | null;
}

export function IsbnSetImport() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const createBook = useCreateBook();

  const [isbnText, setIsbnText] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannedIsbns, setScannedIsbns] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [books, setBooks] = useState<BookEntry[]>([]);
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Parse ISBNs from free-form text (commas, spaces, newlines as separators) */
  const parseIsbns = (text: string): string[] => {
    return text
      .split(/[\s,;]+/)
      .map((s) => s.replace(/[^0-9Xx]/g, ""))
      .filter((s) => s.length >= 10)
      .slice(0, 20);
  };

  const handleScan = (isbn: string) => {
    setScannerOpen(false);
    const clean = isbn.replace(/[^0-9Xx]/g, "");
    if (!clean) return;

    setScannedIsbns((prev) => {
      if (prev.includes(clean)) return prev;
      return [...prev, clean];
    });

    setIsbnText((prev) => {
      if (prev.includes(clean)) return prev;
      return prev ? `${prev}\n${clean}` : clean;
    });
  };

  const handleLookup = useCallback(async () => {
    const isbns = parseIsbns(isbnText);
    if (!isbns.length) return;

    setLoading(true);
    setBooks([]);
    setImportDone(false);
    setError(null);

    try {
      const response = await bulkLookupIsbn(isbns);

      // Fallback safely depending on the API's returned shape
      const resultsList = Array.isArray(response) 
        ? response 
        : response?.results || [];

      setBooks(
        resultsList.map((r: any) => ({
          ...r,
          selectedStatus: "want_to_read", // Automatically defaults to want to read
          selected: true, // Automatically selects the book, even if not found!
        })),
      );
    } catch (err: any) {
      console.error("Failed to lookup ISBNs:", err);
      setError(err?.message || "An error occurred while looking up ISBNs. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [isbnText]);

  const applyStatusToAll = (status: BookStatus) => {
    setBooks((prev) =>
      prev.map((b) => ({ ...b, selectedStatus: status })),
    );
  };

  const setBookStatus = (isbn: string, status: BookStatus) => {
    setBooks((prev) =>
      prev.map((b) => (b.isbn === isbn ? { ...b, selectedStatus: status } : b)),
    );
  };

  const toggleSelect = (isbn: string) => {
    setBooks((prev) =>
      prev.map((b) => (b.isbn === isbn ? { ...b, selected: !b.selected } : b)),
    );
  };

  const updateBookDetails = (isbn: string, field: "title" | "author", value: string) => {
    setBooks((prev) =>
      prev.map((b) => (b.isbn === isbn ? { ...b, [field]: value } : b)),
    );
  };

  // Include ALL selected books, not just the ones with status === "found"
  const selectedBooks = books.filter((b) => b.selected);

  const handleImport = async () => {
    // Make sure manually entered books have at least a title before importing
    const validBooks = selectedBooks.filter(b => b.status === "found" || (b.title && b.title.trim() !== ""));

    if (!validBooks.length) return;
    
    // Debug: Check what data is being sent
    console.log("Importing books with data:", validBooks.map(b => ({ title: b.title, coverUrl: b.coverUrl })));
    
    setImporting(true);
    try {
      await Promise.all(
        validBooks.map((b) =>
          createBook.mutateAsync({
            data: {
              title: b.title ?? "",
              author: b.author ?? "",
              status: b.selectedStatus,
              pages: b.pages ?? null,
              genre: b.genre ?? null,
              coverUrl: b.coverUrl ?? null,
            },
          }),
        ),
      );
      await queryClient.invalidateQueries({ queryKey: getListBooksQueryKey() });
      setImportDone(true);
    } finally {
      setImporting(false);
    }
  };

  if (importDone) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center">
          <CheckCircle className="h-7 w-7 text-primary" />
        </div>
        <p className="font-serif text-xl">
          {t("addBook.setImportSuccess", { count: selectedBooks.length })}
        </p>
        <Button onClick={() => setLocation("/")} className="rounded-full px-8">
          {t("addBook.backToLibrary")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ISBN entry */}
      {books.length === 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t("addBook.setImportHint")}
          </p>
          <Textarea
            value={isbnText}
            onChange={(e) => setIsbnText(e.target.value)}
            placeholder={t("addBook.setImportPlaceholder")}
            rows={5}
            className="font-mono text-sm resize-none"
          />

          {error && (
            <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              <p>{error}</p>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              onClick={handleLookup}
              disabled={loading || !parseIsbns(isbnText).length}
              className="rounded-full px-6"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              {t("addBook.setImportLookup")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setScannerOpen(true)}
              title={t("addBook.scanHint")}
            >
              <ScanBarcode className="h-4 w-4 mr-2" />
              {t("addBook.setImportScan")}
            </Button>
          </div>
          {scannedIsbns.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("addBook.setImportScanned", { count: scannedIsbns.length })}
            </p>
          )}
        </div>
      )}

      {/* Results */}
      {books.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-secondary/50 border border-border/40">
            <span className="text-xs font-medium text-muted-foreground mr-1">
              {t("addBook.setMarkAll")}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs rounded-full"
              onClick={() => applyStatusToAll("want_to_read")}
            >
              <BookMarked className="h-3 w-3 mr-1" />
              {t("addBook.statusWantToRead")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs rounded-full"
              onClick={() => applyStatusToAll("reading")}
            >
              <BookOpen className="h-3 w-3 mr-1" />
              {t("addBook.statusReading")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs rounded-full"
              onClick={() => applyStatusToAll("read")}
            >
              <Check className="h-3 w-3 mr-1" />
              {t("addBook.statusRead")}
            </Button>
          </div>

          <div className="space-y-2">
            {books.map((book) => (
              <BookRow
                key={book.isbn}
                book={book}
                onStatusChange={(s) => setBookStatus(book.isbn, s)}
                onToggleSelect={() => toggleSelect(book.isbn)}
                onUpdateDetails={updateBookDetails}
                t={t}
              />
            ))}
          </div>

          <div className="flex flex-wrap gap-2 pt-2 justify-between items-center">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setBooks([]);
                setScannedIsbns([]);
                setIsbnText("");
              }}
            >
              <X className="h-4 w-4 mr-1" />
              {t("addBook.setImportReset")}
            </Button>
            <Button
              onClick={handleImport}
              disabled={importing || !selectedBooks.length}
              className="rounded-full px-8 font-serif"
            >
              {importing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {t("addBook.setImportAdd", { count: selectedBooks.length })}
            </Button>
          </div>
        </div>
      )}

      <IsbnScannerDialog
        open={scannerOpen}
        onScan={handleScan}
        onClose={() => setScannerOpen(false)}
      />
    </div>
  );
}

interface BookRowProps {
  book: BookEntry;
  onStatusChange: (s: BookStatus) => void;
  onToggleSelect: () => void;
  onUpdateDetails: (isbn: string, field: "title" | "author", value: string) => void;
  t: (key: string) => string;
}

function BookRow({ book, onStatusChange, onToggleSelect, onUpdateDetails, t }: BookRowProps) {
  const isFound = book.status === "found";

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-xl border transition-colors",
        book.selected
          ? "bg-background border-border"
          : "bg-secondary/30 border-border/30 opacity-60",
      )}
    >
      {/* Checkbox - now enabled for all books */}
      <button
        type="button"
        onClick={onToggleSelect}
        className={cn(
          "w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors",
          book.selected
            ? "bg-primary border-primary text-primary-foreground"
            : "border-border bg-background",
        )}
      >
        {book.selected && <Check className="h-3 w-3" />}
      </button>

      {/* Book info */}
      <div className="flex-1 min-w-0">
        {isFound ? (
          <>
            <p className="font-medium text-sm leading-tight truncate">{book.title}</p>
            <p className="text-xs text-muted-foreground truncate">{book.author}</p>
          </>
        ) : (
          <div className="flex flex-col gap-2 mr-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />
              <span className="text-xs text-muted-foreground font-mono">{book.isbn}</span>
              <Badge variant="outline" className="text-xs py-0">
                Manual Entry
              </Badge>
            </div>
            {/* Input fields for missing data */}
            <div className="flex flex-col gap-1.5">
              <Input 
                placeholder="Enter Book Title" 
                value={book.title || ""} 
                onChange={(e) => onUpdateDetails(book.isbn, "title", e.target.value)}
                className="h-8 text-xs bg-background"
                disabled={!book.selected}
              />
              <Input 
                placeholder="Enter Author" 
                value={book.author || ""} 
                onChange={(e) => onUpdateDetails(book.isbn, "author", e.target.value)}
                className="h-8 text-xs bg-background"
                disabled={!book.selected}
              />
            </div>
          </div>
        )}
      </div>

      {/* Status selector — available for manual entries too */}
      <Select
        value={book.selectedStatus}
        onValueChange={(v) => onStatusChange(v as BookStatus)}
        disabled={!book.selected}
      >
        <SelectTrigger className="w-36 h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="want_to_read">{t("addBook.statusWantToRead")}</SelectItem>
          <SelectItem value="reading">{t("addBook.statusReading")}</SelectItem>
          <SelectItem value="read">{t("addBook.statusRead")}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
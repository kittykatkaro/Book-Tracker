import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useCreateBook, getListBooksQueryKey } from "@workspace/api-client-react";
import { bulkLookupIsbn, lookupIsbnSet } from "@workspace/api-client-react";
import type { IsbnBulkEntry, BooksetLookupResult } from "@workspace/api-client-react";
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
  Info,
  Layers,
} from "lucide-react";
import { IsbnScannerDialog } from "@/components/isbn-scanner";
import { cn } from "@/lib/utils";

type BookStatus = "want_to_read" | "reading" | "read";
type SubMode = "multi" | "single";

interface BookEntry extends IsbnBulkEntry {
  selectedStatus: BookStatus;
  selected: boolean;
}

export function IsbnSetImport() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const createBook = useCreateBook();

  const [subMode, setSubMode] = useState<SubMode>("multi");
  const [isbnText, setIsbnText] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannedIsbns, setScannedIsbns] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [books, setBooks] = useState<BookEntry[]>([]);
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState(false);

  // Single boxset-ISBN expansion state
  const [singleIsbn, setSingleIsbn] = useState("");
  const [setInfo, setSetInfo] = useState<BooksetLookupResult | null>(null);
  const [setLookupError, setSetLookupError] = useState<string | null>(null);

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
    if (subMode === "single") {
      setSingleIsbn(clean);
      return;
    }
    if (scannedIsbns.includes(clean)) return;
    setScannedIsbns((prev) => [...prev, clean]);
    setIsbnText((prev) => (prev ? `${prev}\n${clean}` : clean));
  };

  const handleLookup = useCallback(async () => {
    const isbns = parseIsbns(isbnText);
    if (!isbns.length) return;
    setLoading(true);
    setBooks([]);
    setImportDone(false);
    try {
      const { results } = await bulkLookupIsbn(isbns);
      setBooks(
        results.map((r) => ({
          ...r,
          selectedStatus: "want_to_read",
          selected: r.status === "found",
        })),
      );
    } catch {
      // surface nothing — individual statuses will show "error"
    } finally {
      setLoading(false);
    }
  }, [isbnText]);

  const handleSingleLookup = useCallback(async () => {
    const clean = singleIsbn.replace(/[^0-9Xx]/g, "");
    if (clean.length < 10) return;
    setLoading(true);
    setBooks([]);
    setSetInfo(null);
    setSetLookupError(null);
    setImportDone(false);
    try {
      const result = await lookupIsbnSet(clean);
      setSetInfo(result);
      setBooks(
        result.books.map((r) => ({
          ...r,
          selectedStatus: "want_to_read",
          selected: true,
        })),
      );
    } catch {
      setSetLookupError(t("addBook.isbnError"));
    } finally {
      setLoading(false);
    }
  }, [singleIsbn, t]);

  const applyStatusToAll = (status: BookStatus) => {
    setBooks((prev) =>
      prev.map((b) => (b.status === "found" ? { ...b, selectedStatus: status } : b)),
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

  const selectedBooks = books.filter((b) => b.selected && b.status === "found");

  const handleImport = async () => {
    if (!selectedBooks.length) return;
    setImporting(true);
    try {
      await Promise.all(
        selectedBooks.map((b) =>
          createBook.mutateAsync({
            data: {
              title: b.title ?? "",
              author: b.author ?? "",
              status: b.selectedStatus,
              pages: b.pages ?? null,
              genre: b.genre ?? null,
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
          {/* Sub-mode toggle: multiple ISBNs vs. one boxset ISBN */}
          <div className="inline-flex rounded-full border border-border p-1 bg-secondary/50 gap-1">
            <button
              type="button"
              onClick={() => setSubMode("multi")}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                subMode === "multi"
                  ? "bg-background shadow text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t("addBook.setSubModeMulti")}
            </button>
            <button
              type="button"
              onClick={() => setSubMode("single")}
              className={cn(
                "flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors",
                subMode === "single"
                  ? "bg-background shadow text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Layers className="h-3 w-3" />
              {t("addBook.setSubModeSingle")}
            </button>
          </div>

          {subMode === "multi" ? (
            <>
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
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {t("addBook.setSingleHint")}
              </p>
              <div className="flex gap-2">
                <Input
                  value={singleIsbn}
                  onChange={(e) => setSingleIsbn(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSingleLookup()}
                  placeholder={t("addBook.setSinglePlaceholder")}
                  className="font-mono text-sm"
                />
                <Button
                  type="button"
                  onClick={handleSingleLookup}
                  disabled={loading || singleIsbn.replace(/[^0-9Xx]/g, "").length < 10}
                  className="rounded-full px-6"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Layers className="h-4 w-4 mr-2" />
                  )}
                  {t("addBook.setSingleLookup")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setScannerOpen(true)}
                  title={t("addBook.scanHint")}
                >
                  <ScanBarcode className="h-4 w-4" />
                </Button>
              </div>
              {setLookupError && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> {setLookupError}
                </p>
              )}
              {/* Always-visible disclaimer for the boxset-expansion feature */}
              <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
                <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                    {t("addBook.setDisclaimerTitle")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t("addBook.setDisclaimer")}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Boxset lookup came back with no candidates to review */}
      {subMode === "single" && setInfo && books.length === 0 && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-secondary/50 border border-border/40">
          <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="space-y-2">
            <p className="text-sm text-foreground">
              {setInfo.isSet ? t("addBook.setNoMatches") : t("addBook.setNotASet")}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => {
                setSubMode("multi");
                setSetInfo(null);
                setSingleIsbn("");
              }}
            >
              {t("addBook.setSwitchToMulti")}
            </Button>
          </div>
        </div>
      )}

      {/* Results */}
      {books.length > 0 && (
        <div className="space-y-4">
          {/* Boxset expansion context: series guess, confidence, disclaimer */}
          {subMode === "single" && setInfo?.isSet && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {setInfo.seriesName && (
                  <Badge variant="outline" className="text-xs">
                    {t("addBook.setSeriesLabel", { name: setInfo.seriesName })}
                  </Badge>
                )}
                {setInfo.estimatedCount != null && (
                  <Badge variant="outline" className="text-xs">
                    {t("addBook.setEstimatedLabel", { count: setInfo.estimatedCount })}
                  </Badge>
                )}
                {setInfo.confidence && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs",
                      setInfo.confidence === "high" &&
                        "border-green-500/40 text-green-700 dark:text-green-400",
                      setInfo.confidence === "medium" &&
                        "border-amber-500/40 text-amber-700 dark:text-amber-400",
                      setInfo.confidence === "low" &&
                        "border-destructive/40 text-destructive",
                    )}
                  >
                    {t(
                      setInfo.confidence === "high"
                        ? "addBook.setConfidenceHigh"
                        : setInfo.confidence === "medium"
                          ? "addBook.setConfidenceMedium"
                          : "addBook.setConfidenceLow",
                    )}
                  </Badge>
                )}
              </div>
              <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
                <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                    {t("addBook.setDisclaimerTitle")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t("addBook.setDisclaimer")}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Apply-all row */}
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

          {/* Book list */}
          <div className="space-y-2">
            {books.map((book) => (
              <BookRow
                key={book.isbn}
                book={book}
                onStatusChange={(s) => setBookStatus(book.isbn, s)}
                onToggleSelect={() => toggleSelect(book.isbn)}
                t={t}
              />
            ))}
          </div>

          {/* Footer actions */}
          <div className="flex flex-wrap gap-2 pt-2 justify-between items-center">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setBooks([]);
                setScannedIsbns([]);
                setIsbnText("");
                setSingleIsbn("");
                setSetInfo(null);
                setSetLookupError(null);
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
  t: (key: string) => string;
}

function BookRow({ book, onStatusChange, onToggleSelect, t }: BookRowProps) {
  const isFound = book.status === "found";

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-xl border transition-colors",
        book.selected && isFound
          ? "bg-background border-border"
          : "bg-secondary/30 border-border/30 opacity-60",
      )}
    >
      {/* Checkbox */}
      <button
        type="button"
        onClick={onToggleSelect}
        disabled={!isFound}
        className={cn(
          "w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors",
          book.selected && isFound
            ? "bg-primary border-primary text-primary-foreground"
            : "border-border bg-background",
        )}
      >
        {book.selected && isFound && <Check className="h-3 w-3" />}
      </button>

      {/* Book info */}
      <div className="flex-1 min-w-0">
        {isFound ? (
          <>
            <p className="font-medium text-sm leading-tight truncate">{book.title}</p>
            <p className="text-xs text-muted-foreground truncate">{book.author}</p>
          </>
        ) : (
          <div className="flex items-center gap-2">
            {book.status === "not_found" ? (
              <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
            )}
            <span className="text-xs text-muted-foreground font-mono">{book.isbn}</span>
            <Badge variant="outline" className="text-xs py-0">
              {book.status === "not_found" ? t("addBook.setImportNotFound") : t("addBook.setImportFailed")}
            </Badge>
          </div>
        )}
      </div>

      {/* Status selector — only for found books */}
      {isFound && (
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
      )}
    </div>
  );
}

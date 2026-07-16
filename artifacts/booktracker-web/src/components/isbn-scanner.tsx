import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X, ScanBarcode } from "lucide-react";

interface IsbnScannerDialogProps {
  open: boolean;
  onScan: (isbn: string) => void;
  onClose: () => void;
}

export function IsbnScannerDialog({ open, onScan, onClose }: IsbnScannerDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!open) {
      readerRef.current?.reset();
      readerRef.current = null;
      setReady(false);
      setError(null);
      return;
    }

    setError(null);

    // Small delay to let the dialog animate open before accessing video element
    const timer = setTimeout(async () => {
      if (!videoRef.current) return;

      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;

      try {
        await reader.decodeFromConstraints(
          {
            video: {
              facingMode: "environment",
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          },
          videoRef.current,
          (result, err) => {
            if (result) {
              const text = result.getText();
              // Accept EAN-13 (978/979 prefix = book ISBN) or ISBN-10
              if (/^97[89]\d{10}$/.test(text) || /^\d{9}[\dXx]$/.test(text)) {
                readerRef.current?.reset();
                onScan(text);
              }
            }
          },
        );
        setReady(true);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Camera unavailable";
        if (msg.includes("Permission") || msg.includes("NotAllowed")) {
          setError("Camera permission denied. Please allow camera access and try again.");
        } else if (msg.includes("NotFound") || msg.includes("Devices")) {
          setError("No camera found on this device.");
        } else {
          setError(msg);
        }
      }
    }, 150);

    return () => {
      clearTimeout(timer);
      readerRef.current?.reset();
      readerRef.current = null;
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="sm:max-w-md p-0 gap-0 overflow-hidden"
        data-testid="dialog-isbn-scanner"
      >
        <DialogHeader className="p-4 pb-3">
          <DialogTitle className="font-serif flex items-center gap-2">
            <ScanBarcode className="h-5 w-5 text-primary" />
            Scan ISBN Barcode
          </DialogTitle>
        </DialogHeader>

        <div className="relative bg-black" style={{ aspectRatio: "4/3" }}>
          {error ? (
            <div className="flex flex-col items-center justify-center h-full text-white text-sm px-6 text-center gap-3 py-12">
              <ScanBarcode className="h-10 w-10 opacity-40" />
              <p>{error}</p>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                data-testid="video-scanner"
              />
              {/* Viewfinder */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div
                  className="relative w-4/5 h-20 rounded-lg"
                  style={{ border: "2px solid rgba(255,255,255,0.8)", boxShadow: "0 0 0 2000px rgba(0,0,0,0.45)" }}
                >
                  {/* Corner accents */}
                  {["top-0 left-0", "top-0 right-0", "bottom-0 left-0", "bottom-0 right-0"].map((pos, i) => (
                    <span
                      key={i}
                      className={`absolute w-4 h-4 ${pos}`}
                      style={{
                        borderColor: "hsl(152 39% 52%)",
                        borderStyle: "solid",
                        borderWidth: i < 2 ? "2px 0 0 2px" : "0 0 2px 2px",
                        ...(i % 2 === 1 && { borderWidth: i < 2 ? "2px 2px 0 0" : "0 2px 2px 0" }),
                      }}
                    />
                  ))}
                </div>
              </div>
              {!ready && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                  <p className="text-white text-sm animate-pulse">Starting camera…</p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-4 flex flex-col items-center gap-3">
          <p className="text-sm text-muted-foreground text-center">
            Point your camera at the barcode on the back cover
          </p>
          <Button
            variant="outline"
            onClick={onClose}
            data-testid="button-close-scanner"
          >
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

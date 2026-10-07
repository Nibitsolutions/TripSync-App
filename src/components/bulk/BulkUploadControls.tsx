"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, Upload, Loader2 } from "lucide-react";
import { notify, readApiError, getErrorMessage } from "@/lib/notify";

interface UploadSummary {
  total_rows: number;
  created: Array<{ ref: string; number: string; rows: number[] }>;
  skipped: Array<{ row: number; ref: string; reason: string }>;
}

/**
 * "Download Template" + "Upload" for one invoice type or voucher type page. Everything
 * uploaded is saved as Draft; the result dialog lists what was created and every skipped
 * row with its reason.
 */
export function BulkUploadControls({
  kind,
  type,
  label,
  onDone,
}: {
  kind: "invoice" | "voucher";
  type: string;
  /** e.g. "Ticket invoices", "RV - Receipt Vouchers" */
  label: string;
  onDone?: () => void;
}) {
  const base = kind === "invoice" ? "/api/invoices" : "/api/vouchers";
  const fileInput = useRef<HTMLInputElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadSummary | null>(null);

  async function downloadTemplate() {
    setDownloading(true);
    try {
      const res = await fetch(`${base}/bulk-template?type=${encodeURIComponent(type)}`);
      if (!res.ok) throw new Error(await readApiError(res));
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1] || `${type}-template.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      notify.error("Failed to download template", e);
    } finally {
      setDownloading(false);
    }
  }

  async function upload(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("type", type);
      form.append("file", file);
      const res = await fetch(`${base}/bulk-upload`, { method: "POST", body: form });
      if (!res.ok) throw new Error(await readApiError(res));
      const summary = (await res.json()) as UploadSummary;
      setResult(summary);
      if (summary.created.length && !summary.skipped.length) {
        notify.success(`${summary.created.length} ${kind}(s) created as Draft`);
      } else if (!summary.created.length) {
        notify.error("Nothing was created", "Every row had a problem. See the details.");
      } else {
        notify.warning(`${summary.created.length} created, ${summary.skipped.length} row(s) skipped`, "See the details.");
      }
      if (summary.created.length) onDone?.();
    } catch (e) {
      notify.error("Upload failed", getErrorMessage(e));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const skippedRows = result ? new Set(result.skipped.map((s) => s.row)).size : 0;

  return (
    <>
      <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={downloadTemplate} disabled={downloading}>
        {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        Download Template
      </Button>
      <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => fileInput.current?.click()} disabled={uploading}>
        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        {uploading ? "Uploading..." : "Upload"}
      </Button>
      <input
        ref={fileInput}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
        }}
      />

      <Dialog open={!!result} onOpenChange={(open) => !open && setResult(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Upload result — {label}</DialogTitle>
          </DialogHeader>
          {result && (
            <div className="space-y-4 text-[13px]">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-2">
                  <div className="text-lg font-bold">{result.total_rows}</div>
                  <div className="text-[11px] text-gray-500">Rows in file</div>
                </div>
                <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/60 p-2">
                  <div className="text-lg font-bold text-emerald-600">{result.created.length}</div>
                  <div className="text-[11px] text-gray-500">{kind === "invoice" ? "Invoices" : "Vouchers"} created (Draft)</div>
                </div>
                <div className="rounded-lg border border-rose-200 dark:border-rose-900/60 p-2">
                  <div className="text-lg font-bold text-rose-600">{skippedRows}</div>
                  <div className="text-[11px] text-gray-500">Rows skipped</div>
                </div>
              </div>

              {result.created.length > 0 && (
                <div>
                  <div className="font-semibold mb-1">Created</div>
                  <p className="text-[12px] text-gray-600 dark:text-gray-300">
                    {result.created.map((c) => `${c.number} (${c.ref})`).join(", ")}
                  </p>
                </div>
              )}

              {result.skipped.length > 0 && (
                <div>
                  <div className="font-semibold mb-1">Skipped rows</div>
                  <ul className="space-y-1">
                    {result.skipped.map((s, i) => (
                      <li key={`${s.row}-${i}`} className="rounded-md border border-rose-200 dark:border-rose-900/50 bg-rose-50/60 dark:bg-rose-950/20 px-2.5 py-1.5">
                        <span className="font-semibold">Row {s.row}</span>
                        <span className="text-gray-500"> · {s.ref}</span>: {s.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex justify-end">
                <Button onClick={() => setResult(null)}>Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

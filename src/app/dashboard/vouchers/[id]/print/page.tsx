import { notFound } from "next/navigation";
import { connectDB } from "@/lib/mongodb";
import Voucher, { IVoucherEntry } from "@/models/Voucher";

import { numberToWords } from "@/lib/numberToWords";
import { formatDateDDMMYYYY } from "@/lib/date-utils";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

interface Props {
  params: Promise<{ id: string }>;
}

const TYPE_LABELS: Record<string, string> = {
  RV: "Receipt Voucher",
  PV: "Payment Voucher",
  JV: "Journal Voucher",
  DN: "Debit Note",
  CD: "Cash Deposit",
};

export default async function VoucherPrintPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session) return notFound();

  await connectDB();

  const { id } = await params;
  const tenantId = (session.user as { tenant_id?: string }).tenant_id;

  const voucher = await Voucher.findOne({ _id: id, tenant_id: tenantId }).lean();
  if (!voucher) return notFound();

  const totalDebit = voucher.entries.reduce((s: number, e: { debit?: number }) => s + (e.debit || 0), 0);
  const totalCredit = voucher.entries.reduce((s: number, e: { credit?: number }) => s + (e.credit || 0), 0);

  const amountInWords = voucher.amount_in_words || numberToWords(totalDebit || totalCredit);

  return (
    <html>
      <head>
        <title>
          {voucher.voucher_number} — {TYPE_LABELS[voucher.voucher_type] || voucher.voucher_type}
        </title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: Arial, sans-serif; font-size: 12px; color: #111; background: #fff; }
          .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 16mm 14mm; }
          h1 { font-size: 18px; font-weight: 700; text-align: center; letter-spacing: 1px; text-transform: uppercase; }
          .company { font-size: 14px; font-weight: 600; text-align: center; margin-bottom: 2px; }
          .subtitle { font-size: 11px; text-align: center; color: #555; }
          .divider { border-top: 1.5px solid #000; margin: 8px 0; }
          .divider-thin { border-top: 0.5px solid #aaa; margin: 6px 0; }
          .header-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; margin: 10px 0; }
          .header-grid .row { display: flex; gap: 4px; }
          .header-grid .lbl { font-weight: 600; min-width: 110px; color: #333; }
          .header-grid .val { color: #000; }
          .voucher-type-badge { display: inline-block; border: 1.5px solid #000; padding: 2px 8px; font-size: 13px; font-weight: 700; letter-spacing: 1px; }
          table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 11px; }
          th { background: #f0f0f0; border: 1px solid #aaa; padding: 5px 6px; font-weight: 600; text-align: left; }
          td { border: 1px solid #ccc; padding: 4px 6px; vertical-align: top; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          tfoot td { font-weight: 700; background: #f8f8f8; border: 1px solid #aaa; }
          .words-box { border: 1px solid #aaa; padding: 6px 10px; font-weight: 600; font-style: italic; margin-bottom: 10px; background: #fffbea; }
          .remarks-box { border: 1px solid #ccc; padding: 6px 10px; min-height: 32px; }
          .sigs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-top: 32px; }
          .sig-block { border-top: 1px solid #000; padding-top: 4px; font-size: 10px; text-align: center; color: #333; }
          @media print { @page { margin: 0; } .page { margin: 0; padding: 12mm; } }
        `}</style>
      </head>
      <body>
        <div className="page">
          {/* Company Header */}
          <div className="company">TripSync — Finance System</div>
          <div className="subtitle">Voucher Report</div>
          <div className="divider" />

          {/* Voucher type + Number */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div>
              <span className="voucher-type-badge">{voucher.voucher_type}</span>
              <span style={{ marginLeft: 10, fontSize: 16, fontWeight: 700 }}>
                {TYPE_LABELS[voucher.voucher_type] || voucher.voucher_type}
              </span>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "monospace" }}>{voucher.voucher_number}</div>
              <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>
                Status: <strong>{voucher.status}</strong>
              </div>
            </div>
          </div>
          <div className="divider-thin" />

          {/* Header fields */}
          <div className="header-grid">
            <div className="row">
              <span className="lbl">Date:</span>
              <span className="val">
                {voucher.voucher_date
                  ? formatDateDDMMYYYY(voucher.voucher_date)
                  : "—"}
              </span>
            </div>
            <div className="row">
              <span className="lbl">Manual Receipt No:</span>
              <span className="val">{voucher.manual_receipt_no || "—"}</span>
            </div>
            <div className="row">
              <span className="lbl">Name on Voucher:</span>
              <span className="val" style={{ fontWeight: 600 }}>{voucher.name_on_voucher || "—"}</span>
            </div>
            <div className="row">
              <span className="lbl">Cost Center:</span>
              <span className="val">{voucher.cost_center || "—"}</span>
            </div>
            <div className="row">
              <span className="lbl">Cheque No:</span>
              <span className="val">{voucher.cheque_no || "—"}</span>
            </div>
            <div className="row">
              <span className="lbl">Cheque Status:</span>
              <span className="val">{voucher.cheque_status || "—"}</span>
            </div>
            <div className="row">
              <span className="lbl">Debit Account:</span>
              <span className="val">{voucher.debit_account || "—"}</span>
            </div>
            <div className="row">
              <span className="lbl">Print Format:</span>
              <span className="val">{voucher.print_format || "In House"}</span>
            </div>
          </div>
          <div className="divider" />

          {/* Journal Entries Table */}
          <table>
            <thead>
              <tr>
                <th style={{ width: 32 }}>Br</th>
                <th style={{ width: 60 }}>Ref Code</th>
                <th style={{ width: 70 }}>Ref No</th>
                <th style={{ width: 80 }}>Adj Date</th>
                <th>Description</th>
                <th style={{ width: 140 }}>Account Code</th>
                <th className="text-right" style={{ width: 80 }}>Debit</th>
                <th className="text-right" style={{ width: 80 }}>Credit</th>
              </tr>
            </thead>
            <tbody>
              {voucher.entries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center" style={{ color: "#888" }}>No entries</td>
                </tr>
              ) : (
                voucher.entries.map((e: IVoucherEntry, i: number) => (

                  <tr key={i}>
                    <td className="text-center">{e.branch}</td>
                    <td>{e.ref_code}</td>
                    <td>{e.ref_no}</td>
                    <td>{e.adj_date ? formatDateDDMMYYYY(e.adj_date) : ""}</td>
                    <td>{e.description}</td>
                    <td>{e.account_code}</td>
                    <td className="text-right">{e.debit ? e.debit.toLocaleString("en-PK", { minimumFractionDigits: 2 }) : ""}</td>
                    <td className="text-right">{e.credit ? e.credit.toLocaleString("en-PK", { minimumFractionDigits: 2 }) : ""}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={6} className="text-right">Total:</td>
                <td className="text-right">{totalDebit.toLocaleString("en-PK", { minimumFractionDigits: 2 })}</td>
                <td className="text-right">{totalCredit.toLocaleString("en-PK", { minimumFractionDigits: 2 })}</td>
              </tr>
            </tfoot>
          </table>

          {/* Amount in Words */}
          <div className="words-box">
            Amount In Words: {amountInWords}
          </div>

          {/* Remarks */}
          {voucher.remarks && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 4 }}>Remarks:</div>
              <div className="remarks-box">{voucher.remarks}</div>
            </div>
          )}

          <div className="divider" />

          {/* Signatures */}
          <div className="sigs">
            <div className="sig-block">Prepared By</div>
            <div className="sig-block">Checked By</div>
            <div className="sig-block">Approved By</div>
            <div className="sig-block">Received By</div>
          </div>
        </div>

        {/* Auto-print */}
        <script dangerouslySetInnerHTML={{ __html: "window.onload = function() { window.print(); }" }} />
      </body>
    </html>
  );
}

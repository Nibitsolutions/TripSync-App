import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { Payment, PaymentAllocation, Tenant } from "@/models";
import { formatDateDDMMYYYY } from "@/lib/date-utils";
import PrintButtons from "./PrintButtons";

interface PrintParams {
  params: Promise<{ id: string }>;
}

export default async function PrintReceiptPage({ params }: PrintParams) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return notFound();

  await connectDB();

  const tenantId = (session.user as { tenant_id?: string }).tenant_id;
  if (!tenantId) return notFound();

  const payment = await Payment.findOne({ _id: id, tenant_id: tenantId })
    .populate("customer_id", "name email phone address")
    .lean();

  if (!payment) return notFound();

  const allocations = await PaymentAllocation.find({ payment_id: id })
    .populate("invoice_id", "invoice_number total_amount created_at")
    .lean();

  const tenant = await Tenant.findById(tenantId).lean();

  const customer = payment.customer_id as {
    name?: string; email?: string; phone?: string; address?: string;
  } | null;

  const formatDate = (d: Date | string) => formatDateDDMMYYYY(d);

  const totalAllocated = allocations.reduce((sum, a) => sum + a.allocated_amount, 0);
  const remainingUnallocated = payment.amount - totalAllocated;

  const css = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #fff; color: #111; }
    .no-print { position: fixed; top: 16px; right: 16px; z-index: 50; display: flex; gap: 8px; }
    .page { max-width: 800px; margin: 0 auto; padding: 40px; min-height: 100vh; }
    .hdr { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 24px; border-bottom: 2px solid #111827; margin-bottom: 24px; }
    .agency-name { font-size: 22px; font-weight: 700; }
    .agency-sub { font-size: 12px; color: #9ca3af; margin-top: 2px; }
    .agency-contact { font-size: 12px; color: #6b7280; margin-top: 8px; line-height: 1.6; }
    .receipt-title { font-size: 36px; font-weight: 800; letter-spacing: -1px; }
    .receipt-id { font-size: 14px; font-family: monospace; font-weight: 600; color: #4b5563; margin-top: 4px; }
    .receipt-meta { font-size: 12px; color: #6b7280; margin-top: 12px; line-height: 1.8; }
    .receipt-meta strong { color: #374151; }
    .received-from { margin-bottom: 24px; }
    .sec-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #9ca3af; margin-bottom: 6px; }
    .cust-name { font-size: 15px; font-weight: 700; }
    .cust-detail { font-size: 13px; color: #6b7280; line-height: 1.5; }
    .amount-words-box { background: #f9fafb; border: 1px solid #e5e7eb; padding: 16px; border-radius: 8px; margin-bottom: 24px; }
    .amount-row { display: flex; justify-content: space-between; align-items: center; }
    .amount-text { font-size: 24px; font-weight: 800; font-family: monospace; color: #111827; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; }
    th { text-align: left; padding: 8px 0 12px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #9ca3af; border-bottom: 2px solid #111827; }
    th.r { text-align: right; }
    td { padding: 12px 0; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
    td.r { text-align: right; font-family: monospace; font-weight: 600; }
    td.invoice { font-weight: 600; color: #1f2937; }
    td.date { color: #6b7280; }
    td.total { text-align: right; color: #6b7280; }
    td.allocated { text-align: right; font-weight: 600; color: #065f46; }
    .footer { border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 16px; }
    .footer-text { font-size: 12px; color: #6b7280; white-space: pre-line; line-height: 1.6; margin-top: 6px; }
    .generated { text-align: center; margin-top: 32px; font-size: 11px; color: #d1d5db; }
    .badge { display: inline-block; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; }
    .posted { background: #d1fae5; color: #065f46; }
    .voided { background: #fee2e2; color: #991b1b; }
    .sign-row { display: flex; justify-content: space-between; margin-top: 60px; padding-top: 8px; }
    .sign-line { width: 200px; border-top: 1px dashed #9ca3af; text-align: center; font-size: 12px; color: #6b7280; padding-top: 8px; }
    @media print { .no-print { display: none !important; } @page { margin: 15mm; } }
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <PrintButtons />
      <div className="page">
        {/* Header */}
        <div className="hdr">
          <div>
            {tenant?.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tenant.logo_url} alt="logo" style={{ height: 56, objectFit: "contain", marginBottom: 8 }} />
            )}
            <div className="agency-name">{tenant?.name || "Agency"}</div>
            {tenant?.tagline && <div className="agency-sub">{tenant.tagline}</div>}
            <div className="agency-contact">
              {tenant?.address && <div>{tenant.address}</div>}
              {tenant?.city && <div>{tenant.city}</div>}
              {tenant?.contact_phone && <div>📞 {tenant.contact_phone}</div>}
              {tenant?.contact_email && <div>✉ {tenant.contact_email}</div>}
              {tenant?.website && <div>🌐 {tenant.website}</div>}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="receipt-title">RECEIPT</div>
            <div className="receipt-id">REC-{String(payment._id).slice(-8).toUpperCase()}</div>
            <div className="receipt-meta">
              <div><strong>Date:</strong> {formatDate(String(payment.created_at))}</div>
              <div><strong>Payment Method:</strong> {String(payment.payment_method)}</div>
              <div>
                <strong>Status:</strong>{" "}
                <span className={`badge ${payment.status === "Posted" ? "posted" : "voided"}`}>
                  {String(payment.status)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Received From */}
        <div className="received-from">
          <div className="sec-label">Received From</div>
          <div className="cust-name">{customer?.name || "—"}</div>
          <div className="cust-detail">
            {customer?.email && <div>{customer.email}</div>}
            {customer?.phone && <div>{customer.phone}</div>}
            {customer?.address && <div>{customer.address}</div>}
          </div>
        </div>

        {/* Amount Box */}
        <div className="amount-words-box">
          <div className="amount-row">
            <div>
              <div className="sec-label" style={{ marginBottom: 2 }}>Amount Received</div>
              <div style={{ fontSize: 14, color: "#4b5563" }}>
                Payment of {payment.currency} {payment.amount.toLocaleString()} was successfully received and posted.
              </div>
            </div>
            <div className="amount-text">{String(payment.currency)} {payment.amount.toLocaleString()}</div>
          </div>
        </div>

        {/* Allocations Table */}
        {allocations.length > 0 && (
          <div>
            <div className="sec-label">Allocated Invoices</div>
            <table>
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Invoice Date</th>
                  <th className="r">Invoice Total</th>
                  <th className="r">Allocated Amount</th>
                </tr>
              </thead>
              <tbody>
                {allocations.map((a, i) => {
                  const inv = a.invoice_id as { invoice_number?: string; total_amount?: number; created_at?: string | Date } | null;
                  return (
                    <tr key={i}>
                      <td className="invoice">{inv?.invoice_number || "—"}</td>
                      <td className="date">{inv?.created_at ? formatDate(String(inv.created_at)) : "—"}</td>
                      <td className="total">{payment.currency} {inv?.total_amount?.toLocaleString() || "0"}</td>
                      <td className="allocated">{payment.currency} {a.allocated_amount.toLocaleString()}</td>
                    </tr>
                  );
                })}
                {remainingUnallocated > 0 && (
                  <tr>
                    <td colSpan={3} className="invoice" style={{ color: "#b45309" }}>Unallocated Balance (On Account)</td>
                    <td className="allocated" style={{ color: "#b45309" }}>{payment.currency} {remainingUnallocated.toLocaleString()}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Signatures */}
        <div className="sign-row">
          <div className="sign-line">Received By</div>
          <div className="sign-line">Authorized Signature</div>
        </div>

        {/* Footer Notes */}
        {tenant?.invoice_notes && (
          <div className="footer" style={{ marginTop: 40 }}>
            <div className="sec-label">Notes</div>
            <div className="footer-text">{tenant.invoice_notes}</div>
          </div>
        )}

        <div className="generated">Generated by TripSync &middot; {formatDateDDMMYYYY(new Date())}</div>
      </div>
    </>
  );
}
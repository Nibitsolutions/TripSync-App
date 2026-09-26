import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { Tenant } from "@/models";
import PrintButtons from "@/app/dashboard/invoices/[id]/print/PrintButtons";

interface PrintParams {
  searchParams: Promise<{ customer_id?: string; from?: string; to?: string }>;
}

export default async function PrintInvoiceAgingPage({ searchParams }: PrintParams) {
  const { customer_id, from, to } = await searchParams;
  const session = await getServerSession(authOptions);
  if (!session?.user) return notFound();

  await connectDB();

  const tenantId = (session.user as { tenant_id?: string }).tenant_id;
  if (!tenantId) return notFound();

  const tenant = await Tenant.findById(tenantId).lean();

  // Fetch report data from internal API logic or URL
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const queryParams = new URLSearchParams();
  if (customer_id) queryParams.set("customer_id", customer_id);
  if (from) queryParams.set("from", from);
  if (to) queryParams.set("to", to);

  const res = await fetch(`${baseUrl}/api/reports/invoice-aging?${queryParams.toString()}`, {
    headers: { cookie: `next-auth.session-token=${session}` },
    cache: "no-store",
  }).catch(() => null);

  let data = null;
  if (res && res.ok) {
    data = await res.json();
  }

  const formatDate = (d: string) => {
    if (!d) return "";
    const dateObj = new Date(d);
    if (isNaN(dateObj.getTime())) return d;
    const day = String(dateObj.getDate()).padStart(2, "0");
    const month = String(dateObj.getMonth() + 1).padStart(2, "0");
    const year = dateObj.getFullYear();
    return `${day}-${month}-${year}`;
  };

  const formatPrintDateTime = () => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, "0");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = months[now.getMonth()];
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    return `Print Date ${day}, ${month} ${year} ${hours}:${minutes}`;
  };

  const fromDisplay = from ? formatDate(from) : "01-01-2024";
  const toDisplay = to ? formatDate(to) : formatDate(new Date().toISOString());

  const reports = data?.customer_reports || [];
  const grandTotals = data?.grand_totals || {
    sale_gross: 0, sp_discount: 0, kb_margin: 0, sale_net: 0, refund_amt: 0, receipt_amt: 0, adjustment_amt: 0, balance: 0, final_receivable: 0
  };

  const css = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { font-family: Arial, Helvetica, sans-serif; background: #ffffff !important; color: #000000 !important; color-scheme: light !important; -webkit-print-color-adjust: exact; }
    .print-wrapper { background: #ffffff !important; min-height: 100vh; color: #000000 !important; width: 100%; padding: 24px; }
    .no-print { position: fixed; top: 16px; right: 16px; z-index: 50; display: flex; gap: 8px; }
    .page { max-width: 1050px; margin: 0 auto; background: #ffffff !important; color: #000000 !important; font-size: 11px; }

    .header-area { text-align: center; margin-bottom: 12px; position: relative; }
    .company-title { font-size: 22px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; }
    .company-sub { font-size: 11px; margin-top: 2px; }
    .report-title { font-size: 18px; font-weight: normal; margin-top: 10px; }
    .report-dates { font-size: 11px; color: #333333; margin-top: 2px; }
    .print-date { position: absolute; right: 0; top: 50px; font-size: 11px; color: #333333; }

    .customer-block { margin-top: 16px; margin-bottom: 10px; }
    .cust-name { font-size: 13px; font-weight: bold; text-transform: uppercase; }
    .cust-info { font-size: 11px; margin-top: 2px; }

    .aging-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 11px; border: 1px solid #777777; }
    .aging-table th, .aging-table td { border: 1px solid #777777; padding: 4px 6px; text-align: left; vertical-align: middle; }
    .aging-table th { font-weight: bold; background-color: #ffffff; color: #000000; text-align: center; }
    .aging-table td.r, .aging-table th.r { text-align: right; }
    .aging-table td.c, .aging-table th.c { text-align: center; }
    .aging-table tr.total-row td { font-weight: bold; text-align: right; }

    .unadjusted-section { margin-top: 20px; margin-bottom: 16px; text-align: center; }
    .unadjusted-title { font-size: 16px; font-weight: normal; margin-bottom: 8px; text-align: center; }

    .final-receivable-row { display: flex; justify-content: flex-end; align-items: center; gap: 40px; margin-top: 12px; margin-bottom: 30px; font-size: 12px; font-weight: bold; }

    .grand-total-bar { margin-top: 30px; }

    .footer-credits { text-align: right; margin-top: 40px; font-size: 11px; color: #444444; line-height: 1.4; }

    @media print {
      .no-print { display: none !important; }
      .print-wrapper { padding: 0 !important; }
      .page { max-width: 100% !important; margin: 0 !important; }
      @page { margin: 10mm; size: A4 landscape; }
    }
  `;

  return (
    <div className="print-wrapper bg-white text-black min-h-screen">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <PrintButtons />
      <div className="page">
        {/* Header */}
        <div className="header-area">
          <div className="company-title">{tenant?.name || "TRAVELAIR INTERNATIONAL"}</div>
          <div className="company-sub">{tenant?.address || "Shop 10, Block 51, Chaudhry Plaza, Blue Area, Islamabad"}</div>
          <div className="company-sub">Phone: {tenant?.contact_phone || "+92-51-2274341/2274080"} Fax: {tenant?.contact_email ? `Email: ${tenant.contact_email}` : "Fax: +92-51-2274078"}</div>
          
          <div className="report-title">Invoice Wise Aging</div>
          <div className="report-dates">From: {fromDisplay} To: {toDisplay}</div>
          <div className="print-date">{formatPrintDateTime()}</div>
        </div>

        {reports.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", fontSize: 13, color: "#666" }}>
            No invoice aging records found for the selected criteria.
          </div>
        ) : (
          reports.map((rep: {
            customer: { name: string; phone?: string; address?: string };
            invoices: Array<{
              date: string;
              invoice_number: string;
              description: string;
              sale_gross: number;
              sp_discount: number;
              kb_margin: number;
              sale_net: number;
              refund_amt: number;
              receipt_amt: number;
              adjustment_amt: number;
              balance: number;
              days_over: number;
            }>;
            totals: {
              sale_gross: number;
              sp_discount: number;
              kb_margin: number;
              sale_net: number;
              refund_amt: number;
              receipt_amt: number;
              adjustment_amt: number;
              balance: number;
            };
            unadjusted_vouchers: Array<{
              date: string;
              adj_date: string;
              voucher_no: string;
              reference: string;
              description: string;
              debit: number;
              credit: number;
            }>;
            unadjusted_totals: { debit: number; credit: number };
            final_receivable: number;
          }, rIdx: number) => (
            <div key={rIdx} style={{ marginBottom: 30 }}>
              {/* Customer Info */}
              <div className="customer-block">
                <div className="cust-name">{rep.customer.name}</div>
                <div className="cust-info">Phone: {rep.customer.phone || "—"}</div>
                <div className="cust-info">Address: {rep.customer.address || "—"}</div>
              </div>

              {/* Invoice Wise Aging Table */}
              <table className="aging-table">
                <thead>
                  <tr>
                    <th style={{ width: "70px" }}>Date</th>
                    <th style={{ width: "55px" }}>Inv. No</th>
                    <th style={{ textAlign: "left", paddingLeft: "6px" }}>Description</th>
                    <th style={{ width: "85px" }} className="r">Sale Amt (GRS)</th>
                    <th style={{ width: "45px" }} className="r">SP</th>
                    <th style={{ width: "45px" }} className="r">KB</th>
                    <th style={{ width: "85px" }} className="r">Sale Amt (Net)</th>
                    <th style={{ width: "75px" }} className="r">Refund Amt</th>
                    <th style={{ width: "65px" }} className="r">Receipt</th>
                    <th style={{ width: "70px" }} className="r">Adjustment</th>
                    <th style={{ width: "85px" }} className="r">Balance</th>
                    <th style={{ width: "45px" }} className="c">Days Over</th>
                  </tr>
                </thead>
                <tbody>
                  {rep.invoices.map((inv: {
                    date: string;
                    invoice_number: string;
                    description: string;
                    sale_gross: number;
                    sp_discount: number;
                    kb_margin: number;
                    sale_net: number;
                    refund_amt: number;
                    receipt_amt: number;
                    adjustment_amt: number;
                    balance: number;
                    days_over: number;
                  }, iIdx: number) => (
                    <tr key={iIdx}>
                      <td className="c">{formatDate(inv.date)}</td>
                      <td className="c" style={{ fontFamily: "monospace", fontWeight: "bold" }}>{inv.invoice_number}</td>
                      <td>{inv.description}</td>
                      <td className="r">{inv.sale_gross.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="r">{inv.sp_discount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="r">{inv.kb_margin.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="r">{inv.sale_net.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="r">{inv.refund_amt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="r">{inv.receipt_amt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="r">{inv.adjustment_amt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="r" style={{ fontWeight: "bold" }}>{inv.balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="c">{inv.days_over}</td>
                    </tr>
                  ))}

                  {/* Customer Totals Row */}
                  <tr className="total-row">
                    <td colSpan={3} style={{ textAlign: "right" }}>Total</td>
                    <td className="r">{rep.totals.sale_gross.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="r">{rep.totals.sp_discount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="r">{rep.totals.kb_margin.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="r">{rep.totals.sale_net.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="r">{rep.totals.refund_amt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="r">{rep.totals.receipt_amt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="r">{rep.totals.adjustment_amt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="r" style={{ fontWeight: "bold" }}>{rep.totals.balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>

              {/* Un-Adjusted Voucher Section */}
              <div className="unadjusted-section">
                <div className="unadjusted-title">Un-Adjusted Voucher</div>
                <table className="aging-table">
                  <thead>
                    <tr>
                      <th style={{ width: "70px" }}>Date</th>
                      <th style={{ width: "70px" }}>Adj Date</th>
                      <th style={{ width: "90px" }}>Voucher No</th>
                      <th style={{ width: "100px" }}>Reference</th>
                      <th style={{ textAlign: "left", paddingLeft: "6px" }}>Description</th>
                      <th style={{ width: "85px" }} className="r">Debit</th>
                      <th style={{ width: "85px" }} className="r">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rep.unadjusted_vouchers.length === 0 ? (
                      <tr>
                        <td className="c">—</td>
                        <td className="c">—</td>
                        <td className="c">—</td>
                        <td className="c">—</td>
                        <td>Opening Balance</td>
                        <td className="r">0.00</td>
                        <td className="r">0.00</td>
                      </tr>
                    ) : (
                      rep.unadjusted_vouchers.map((uv: {
                        date: string;
                        adj_date: string;
                        voucher_no: string;
                        reference: string;
                        description: string;
                        debit: number;
                        credit: number;
                      }, uvIdx: number) => (
                        <tr key={uvIdx}>
                          <td className="c">{formatDate(uv.date)}</td>
                          <td className="c">{formatDate(uv.adj_date)}</td>
                          <td className="c" style={{ fontFamily: "monospace" }}>{uv.voucher_no}</td>
                          <td className="c">{uv.reference}</td>
                          <td>{uv.description}</td>
                          <td className="r">{uv.debit.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="r">{uv.credit.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                      ))
                    )}
                    <tr className="total-row">
                      <td colSpan={5} style={{ textAlign: "right" }}>TOTAL</td>
                      <td className="r">{rep.unadjusted_totals.debit.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="r">{rep.unadjusted_totals.credit.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Final Receivable */}
              <div className="final-receivable-row">
                <span>Final Receivable</span>
                <span style={{ fontFamily: "monospace", fontSize: 13 }}>
                  {rep.final_receivable.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          ))
        )}

        {/* Grand Total Bar Across All Customers */}
        {reports.length > 0 && (
          <div className="grand-total-bar">
            <table className="aging-table">
              <tbody>
                <tr className="total-row" style={{ backgroundColor: "#f8fafc" }}>
                  <td colSpan={3} style={{ textAlign: "right", fontStyle: "bold", fontSize: 12 }}>Grand Total</td>
                  <td className="r">{grandTotals.sale_gross.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="r">{grandTotals.sp_discount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="r">{grandTotals.kb_margin.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="r">{grandTotals.sale_net.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="r">{grandTotals.refund_amt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="r">{grandTotals.receipt_amt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="r">{grandTotals.adjustment_amt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="r" style={{ fontWeight: "bold" }}>{grandTotals.balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        <div className="footer-credits">
          <div>Powered By TripSync</div>
          <div>support@tripsync.com</div>
        </div>
      </div>
    </div>
  );
}

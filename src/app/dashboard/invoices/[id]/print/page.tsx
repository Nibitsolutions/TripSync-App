import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { Metadata } from "next";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { Invoice, InvoiceLineItem, Tenant } from "@/models";
import { numberToWords } from "@/lib/numberToWords";
import { getAirlineByTicketNumber } from "@/lib/iataAirlines";
import PrintButtons from "./PrintButtons";

interface PrintParams {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PrintParams): Promise<Metadata> {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return { title: "Invoice" };

  await connectDB();
  const tenantId = (session.user as { tenant_id?: string }).tenant_id;
  if (!tenantId) return { title: "Invoice" };

  const invoice = await Invoice.findOne({ _id: id, tenant_id: tenantId })
    .populate("customer_id", "name")
    .lean();

  if (!invoice) return { title: "Invoice" };

  const customer = invoice.customer_id as { name?: string } | null;
  const rawCustName = (invoice.print_name || customer?.name || "Customer").trim();
  const formattedCustName = rawCustName.replace(/\s+/g, "_").replace(/[/\\?%*:|"<>]/g, "");
  const invNum = String(invoice.invoice_number || "").trim().replace(/[/\\?%*:|"<>]/g, "");

  return {
    title: `${invNum}-${formattedCustName}`,
  };
}

export default async function PrintInvoicePage({ params }: PrintParams) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return notFound();

  await connectDB();

  const tenantId = (session.user as { tenant_id?: string }).tenant_id;
  if (!tenantId) return notFound();

  const invoice = await Invoice.findOne({ _id: id, tenant_id: tenantId })
    .populate("customer_id", "name email phone address contact_person fax")
    .populate("spo_id", "name email")
    .populate("supplier_id", "name code")
    .lean();

  if (!invoice) return notFound();

  const lineItems = await InvoiceLineItem.find({ invoice_id: id })
    .populate("tax_code_id", "code rate")
    .lean();

  const tenant = await Tenant.findById(tenantId).lean();

  const customer = invoice.customer_id as {
    name?: string; email?: string; phone?: string; address?: string; contact_person?: string; fax?: string;
  } | null;

  const rawCustName = (invoice.print_name || customer?.name || "Customer").trim();
  const formattedCustName = rawCustName.replace(/\s+/g, "_").replace(/[/\\?%*:|"<>]/g, "");
  const invNum = String(invoice.invoice_number || "").trim().replace(/[/\\?%*:|"<>]/g, "");
  const pdfTitle = `${invNum}-${formattedCustName}`;

  const formatDate = (d: Date | string) => {
    if (!d) return "";
    const dateObj = new Date(d);
    if (isNaN(dateObj.getTime())) return String(d);
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
    return `Print Date: ${day}, ${month} ${year} ${hours}:${minutes}`;
  };

  // Calculations for Account Payable grid columns
  let totalFare = 0;
  let totalApt = 0;
  let totalCvt = 0;
  let totalPsf = 0;
  let totalOth = 0;
  let totalSst = 0;
  let grandTotal = 0;

  const rows = lineItems.map((li, index) => {
    const fare = Number(li.base_fare || (li.service_type === "Ticket" ? li.amount : li.amount)) || 0;
    const apt = Number(li.tax_apt) || 0;
    const cvt = Number(li.tax_cvt) || 0;
    const psf = Number(li.psf_amount) || 0;
    const sst = Number(li.tax_sst) || 0;
    
    // Other taxes combined (DOF + YQ + RG + PK + City Tax)
    const oth = (Number(li.tax_dof) || 0) + 
                (Number(li.tax_yq) || 0) + 
                (Number(li.tax_rg) || 0) + 
                (Number(li.tax_pk) || 0) + 
                (Number(li.tax_airline_city) || 0);

    const total = Number(li.amount) || (fare + apt + cvt + psf + oth + sst);

    totalFare += fare;
    totalApt += apt;
    totalCvt += cvt;
    totalPsf += psf;
    totalOth += oth;
    totalSst += sst;
    grandTotal += total;

    // Flight segment details
    const firstSeg = Array.isArray(li.flight_segments) && li.flight_segments[0] ? li.flight_segments[0] : null;
    const airlineCode = li.airline_code || (li.ticket_number ? getAirlineByTicketNumber(li.ticket_number)?.code : "") || "EK";
    const flightNo = firstSeg?.flight_no || "";
    const bookingClass = firstSeg?.booking_class || "";
    const depDateStr = firstSeg?.dep_date ? formatDate(firstSeg.dep_date) : "";
    const sector = li.sector || firstSeg?.city || "";

    return {
      sNo: index + 1,
      passenger: li.pax_name || "PASSENGER",
      airline: airlineCode,
      flight: flightNo,
      bookingClass,
      departure: depDateStr,
      sector,
      ticketNumber: li.ticket_number || "EMD-",
      fare,
      apt,
      cvt,
      psf,
      oth,
      sst,
      total,
    };
  });

  const agentName = (invoice.spo_id as { name?: string })?.name || "E";
  const amountWordsText = numberToWords(grandTotal, "Rupees").replace("Rupees", "").replace("Only", "").trim();

  const css = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { font-family: Arial, Helvetica, sans-serif; background: #ffffff !important; color: #000000 !important; color-scheme: light !important; -webkit-print-color-adjust: exact; }
    .print-wrapper { background: #ffffff !important; min-height: 100vh; color: #000000 !important; width: 100%; padding: 20px; }
    .no-print { position: fixed; top: 16px; right: 16px; z-index: 50; display: flex; gap: 8px; }
    .page { max-width: 960px; margin: 0 auto; background: #ffffff !important; color: #000000 !important; font-size: 12px; }
    
    .print-date { text-align: right; font-size: 11px; color: #333333; margin-bottom: 8px; }
    
    .company-header { text-align: center; margin-bottom: 12px; }
    .company-name { font-size: 22px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; color: #000000; }
    .company-address { font-size: 12px; margin-top: 3px; color: #111111; }
    .company-contact { font-size: 11px; margin-top: 2px; color: #222222; }
    .company-license { font-size: 11px; margin-top: 2px; font-weight: bold; color: #000000; }

    .invoice-banner-container { text-align: center; margin: 10px 0 16px 0; }
    .invoice-banner { display: inline-block; background-color: #cccccc !important; color: #000000 !important; font-weight: bold; font-size: 16px; letter-spacing: 3px; padding: 4px 60px; text-transform: uppercase; border-radius: 2px; }

    .grid-boxes { display: grid; grid-template-columns: 1.2fr 1fr; gap: 16px; margin-bottom: 16px; }
    .info-box { border: 1px solid #777777; padding: 8px 12px; font-size: 12px; line-height: 1.6; min-height: 110px; }
    .info-row { display: flex; margin-bottom: 2px; }
    .info-label { width: 110px; color: #111111; }
    .info-val { font-weight: bold; color: #000000; flex: 1; }

    .invoice-grid-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 11px; border: 1px solid #777777; }
    .invoice-grid-table th, .invoice-grid-table td { border: 1px solid #777777; padding: 5px 4px; text-align: left; vertical-align: middle; }
    .invoice-grid-table th { font-weight: bold; background-color: #ffffff; color: #000000; text-align: center; }
    .invoice-grid-table td.r, .invoice-grid-table th.r { text-align: right; }
    .invoice-grid-table td.c, .invoice-grid-table th.c { text-align: center; }
    .invoice-grid-table tr.totals-row td { font-weight: bold; }

    .totals-breakdown { display: flex; justify-content: flex-end; margin-top: 8px; margin-bottom: 16px; }
    .totals-table { border-collapse: collapse; font-size: 12px; }
    .totals-table td { padding: 4px 12px; }
    .totals-table td.label { text-align: right; font-weight: bold; }
    .totals-table td.val { text-align: right; font-weight: bold; font-family: Arial, sans-serif; min-width: 100px; }

    .words-and-terms { margin-top: 10px; margin-bottom: 40px; }
    .words-text { font-size: 13px; font-weight: bold; margin-bottom: 6px; text-transform: capitalize; color: #000000; }
    .terms-text { font-size: 11px; color: #222222; line-height: 1.4; max-width: 95%; }

    .signatures-container { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; text-align: center; margin-top: 50px; margin-bottom: 20px; }
    .sig-block { text-align: center; }
    .sig-name { font-size: 12px; font-weight: bold; text-transform: uppercase; margin-bottom: 4px; min-height: 16px; color: #000000; }
    .sig-line { border-top: 1px solid #555555; margin-bottom: 4px; }
    .sig-label { font-size: 12px; color: #111111; }

    .bottom-disclaimer { text-align: left; font-size: 11px; font-weight: bold; text-transform: uppercase; color: #000000; margin-top: 15px; }

    @media print {
      .no-print { display: none !important; }
      .print-wrapper { padding: 0 !important; }
      .page { max-width: 100% !important; margin: 0 !important; }
      @page { margin: 10mm; size: A4 portrait; }
    }
  `;

  return (
    <div className="print-wrapper bg-white text-black min-h-screen">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <PrintButtons title={pdfTitle} />
      <div className="page">
        {/* Top Right Print Date */}
        <div className="print-date">{formatPrintDateTime()}</div>

        {/* Company Header */}
        <div className="company-header">
          <div className="company-name">{tenant?.name || "TRAVELAIR INTERNATIONAL"}</div>
          <div className="company-address">{tenant?.address || "Shop 10, Block 51, Chaudhry Plaza, Blue Area, Islamabad"}</div>
          <div className="company-contact">
            Phone: {tenant?.contact_phone || "+92-51-2274341/2274080"} Fax: {tenant?.contact_email ? `Email: ${tenant.contact_email}` : "Fax: +92-51-2274078"}
          </div>
          <div className="company-license">
            LICENSE NO: {tenant?.registration_no || "ID-635"}, IATA CODE: {tenant?.iata_code || "27-3-28011"}, NTN: {tenant?.ntn || "0374801-4"}
          </div>
        </div>

        {/* Banner Box */}
        <div className="invoice-banner-container">
          <span className="invoice-banner">INVOICE</span>
        </div>

        {/* Two Side-by-Side Detail Boxes */}
        <div className="grid-boxes">
          {/* Left Box: Client */}
          <div className="info-box">
            <div className="info-row">
              <span className="info-label">Client:</span>
              <span className="info-val">{invoice.print_name || customer?.name || "—"}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Address:</span>
              <span>{customer?.address || "—"}</span>
            </div>
            <div className="info-row" style={{ marginTop: 8 }}>
              <span className="info-label">Phone:</span>
              <span>{customer?.phone || "—"}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Fax:</span>
              <span>{customer?.fax || "—"}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Contact Person:</span>
              <span>{customer?.contact_person || "—"}</span>
            </div>
          </div>

          {/* Right Box: Invoice Meta */}
          <div className="info-box">
            <div className="info-row">
              <span className="info-label">Invoice No:</span>
              <span className="info-val">{invoice.invoice_number}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Invoice Date:</span>
              <span>{formatDate(invoice.created_at)}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Client XO:</span>
              <span>—</span>
            </div>
            <div className="info-row">
              <span className="info-label">Our XO:</span>
              <span>{agentName}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Remarks:</span>
              <span>{invoice.customer_remarks || "—"}</span>
            </div>
          </div>
        </div>

        {/* Line Items Table */}
        <table className="invoice-grid-table">
          <thead>
            <tr>
              <th rowSpan={2} style={{ width: "38px" }}>S No.</th>
              <th rowSpan={2} style={{ textAlign: "left", paddingLeft: "6px" }}>Passenger</th>
              <th rowSpan={2} style={{ width: "32px" }}>AL</th>
              <th rowSpan={2} style={{ width: "55px" }}>Flight</th>
              <th rowSpan={2} style={{ width: "28px" }}>CL</th>
              <th rowSpan={2} style={{ width: "120px" }}>Departure</th>
              <th rowSpan={2} style={{ width: "75px" }}>Sector</th>
              <th rowSpan={2} style={{ width: "125px" }}>Ticket Number</th>
              <th colSpan={6} style={{ textAlign: "center" }}>Account Payable</th>
              <th rowSpan={2} style={{ width: "75px" }} className="r">Total</th>
            </tr>
            <tr>
              <th style={{ width: "55px" }} className="r">Fare</th>
              <th style={{ width: "35px" }} className="r">APT</th>
              <th style={{ width: "35px" }} className="r">CVT</th>
              <th style={{ width: "35px" }} className="r">PSF</th>
              <th style={{ width: "55px" }} className="r">OTH</th>
              <th style={{ width: "55px" }} className="r">SST/PST</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.sNo}>
                <td className="c">{row.sNo}</td>
                <td style={{ fontWeight: "bold" }}>{row.passenger}</td>
                <td className="c">{row.airline}</td>
                <td className="c">{row.flight || "—"}</td>
                <td className="c">{row.bookingClass || "—"}</td>
                <td className="c">{row.departure || "—"}</td>
                <td className="c">{row.sector || "—"}</td>
                <td className="c" style={{ fontFamily: "monospace" }}>{row.ticketNumber}</td>
                <td className="r">{row.fare > 0 ? row.fare.toLocaleString() : "0"}</td>
                <td className="r">{row.apt > 0 ? row.apt.toLocaleString() : "0"}</td>
                <td className="r">{row.cvt > 0 ? row.cvt.toLocaleString() : "0"}</td>
                <td className="r">{row.psf > 0 ? row.psf.toLocaleString() : "0"}</td>
                <td className="r">{row.oth > 0 ? row.oth.toLocaleString() : "0"}</td>
                <td className="r">{row.sst > 0 ? row.sst.toLocaleString() : "0"}</td>
                <td className="r" style={{ fontWeight: "bold" }}>{row.total.toLocaleString()}</td>
              </tr>
            ))}

            {/* Table Total Summary Row */}
            <tr className="totals-row">
              <td colSpan={8} style={{ textAlign: "center", fontWeight: "bold" }}>Total</td>
              <td className="r">{totalFare.toLocaleString()}</td>
              <td className="r">{totalApt.toLocaleString()}</td>
              <td className="r">{totalCvt.toLocaleString()}</td>
              <td className="r">{totalPsf.toLocaleString()}</td>
              <td className="r">{totalOth.toLocaleString()}</td>
              <td className="r">{totalSst.toLocaleString()}</td>
              <td className="r" style={{ fontWeight: "bold" }}>{grandTotal.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>

        {/* Breakdown Totals */}
        <div className="totals-breakdown">
          <table className="totals-table">
            <tbody>
              <tr>
                <td className="label">Ticket Total</td>
                <td className="val">{grandTotal.toLocaleString()}</td>
              </tr>
              <tr>
                <td className="label">Total</td>
                <td className="val">{grandTotal.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Words & Terms */}
        <div className="words-and-terms">
          <div className="words-text">{amountWordsText}</div>
          <div className="terms-text">
            Payment should be made by payee’s A/C cheque within 15 days of issuance of ticket(s), if cash payment is made an official receipt should be obtained immediately, otherwise company does not hold responsibility for cash.
          </div>
        </div>

        {/* Signatures */}
        <div className="signatures-container">
          <div className="sig-block">
            <div className="sig-name">{agentName !== "E" ? agentName : "ZAHIR"}</div>
            <div className="sig-line"></div>
            <div className="sig-label">Prepared By</div>
          </div>
          <div className="sig-block">
            <div className="sig-name"></div>
            <div className="sig-line"></div>
            <div className="sig-label">Checked By</div>
          </div>
          <div className="sig-block">
            <div className="sig-name"></div>
            <div className="sig-line"></div>
            <div className="sig-label">Chief Executive</div>
          </div>
          <div className="sig-block">
            <div className="sig-name"></div>
            <div className="sig-line"></div>
            <div className="sig-label">Received By</div>
          </div>
        </div>

        {/* Bottom Disclaimer */}
        <div className="bottom-disclaimer">
          CREDIT AGREEMENT FOR PASSAGE FARE AND/OR EXCESS BAGGAGE CHARGE.
        </div>
      </div>
    </div>
  );
}

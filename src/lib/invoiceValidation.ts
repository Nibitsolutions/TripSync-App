export interface InvoicePostingValidationInput {
  inv_date?: string;
  customer_id?: string | { _id: string; name?: string };
  print_name?: string;
  visit_type?: string;
  payment_mode?: string;
  line_items?: Array<{
    service_type?: string;
    pax_name?: string;
    pax_type?: string;
    ticket_number?: string;
    airline_name?: string;
    airline_code?: string;
    supplier_id?: string | { _id: string; name?: string };
    sector?: string;
    doc_type?: string;
    trip_type?: string;
    description?: string;
    amount?: number | string;
  }>;
}

export function validateInvoiceForPosting(data: InvoicePostingValidationInput): string[] {
  const errors: string[] = [];

  // 1. Header Validation (fields marked with *)
  const custId = typeof data.customer_id === "object" && data.customer_id !== null ? data.customer_id._id : data.customer_id;
  if (!custId || !String(custId).trim()) {
    errors.push("Customer is missing");
  }

  if (!data.print_name || !String(data.print_name).trim()) {
    errors.push("Print Name is missing");
  }

  if (!data.inv_date || !String(data.inv_date).trim()) {
    errors.push("Invoice Date is missing");
  }

  if (!data.visit_type || !String(data.visit_type).trim()) {
    errors.push("Visit Type is missing");
  }

  if (!data.payment_mode || !String(data.payment_mode).trim()) {
    errors.push("Payment Mode is missing");
  }

  // 2. Line Items Validation
  if (!data.line_items || data.line_items.length === 0) {
    errors.push("Invoice must contain at least one line item");
  } else {
    data.line_items.forEach((item, index) => {
      const ticketLabel = data.line_items!.length > 1 ? `Ticket #${index + 1}` : "Ticket";

      // If service_type is Ticket (or undefined/empty defaulting to Ticket)
      if (!item.service_type || item.service_type === "Ticket") {
        if (!item.pax_name || !String(item.pax_name).trim()) {
          errors.push(`${ticketLabel}: Passenger Name (Pax) is missing`);
        }
        if (!item.pax_type || !String(item.pax_type).trim()) {
          errors.push(`${ticketLabel}: Passenger Type (Pax Type) is missing`);
        }
        if (!item.ticket_number || !String(item.ticket_number).trim()) {
          errors.push(`${ticketLabel}: Ticket Number is missing`);
        }
        
        const airline = (item.airline_name || item.airline_code || "").trim();
        if (!airline) {
          errors.push(`${ticketLabel}: Airline is missing`);
        }

        const suppId = typeof item.supplier_id === "object" && item.supplier_id !== null ? item.supplier_id._id : item.supplier_id;
        if (!suppId || !String(suppId).trim()) {
          errors.push(`${ticketLabel}: Supplier / BSP is missing`);
        }

        if (!item.sector || !String(item.sector).trim()) {
          errors.push(`${ticketLabel}: Sector is missing`);
        }
        if (!item.doc_type || !String(item.doc_type).trim()) {
          errors.push(`${ticketLabel}: Doc Type is missing`);
        }
        if (!item.trip_type || !String(item.trip_type).trim()) {
          errors.push(`${ticketLabel}: Trip Type is missing`);
        }
      }
    });
  }

  return errors;
}

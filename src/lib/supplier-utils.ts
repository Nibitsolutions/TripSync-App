import { SUPPLIER_VENDOR_CATEGORIES, ISupplierContactPerson, ISupplierVendor } from "@/models/Supplier";

const str = (v: unknown) => (v === undefined || v === null ? "" : String(v).trim());

function cleanContactPersons(list: unknown): ISupplierContactPerson[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((c: Record<string, unknown>) => ({
      name: str(c?.name),
      designation: str(c?.designation),
      cell_phone: str(c?.cell_phone),
      phone: str(c?.phone),
      fax: str(c?.fax),
      email: str(c?.email),
    }))
    .filter((c) => c.name || c.designation || c.cell_phone || c.phone || c.fax || c.email);
}

function cleanVendors(list: unknown): ISupplierVendor[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((v: Record<string, unknown>) => ({ category: str(v?.category), title: str(v?.title), details: str(v?.details) }))
    .filter((v) => (SUPPLIER_VENDOR_CATEGORIES as readonly string[]).includes(v.category) && v.title);
}

/**
 * Normalise a supplier create/update payload and check the compulsory (*) fields:
 * Code*, Title*, GL Account*, and a name on every contact person that has any details.
 */
export function parseSupplierPayload(body: Record<string, unknown>) {
  const contact_persons = cleanContactPersons(body.contact_persons);
  const firstContact = contact_persons[0];

  const fields = {
    code: str(body.code).toUpperCase(),
    name: str(body.name),
    short_name: str(body.short_name),
    details: str(body.details),
    business_email: str(body.business_email),

    gl_account: str(body.gl_account) || "201001",
    credit_limit: body.credit_limit !== undefined && body.credit_limit !== null && body.credit_limit !== "" ? parseFloat(String(body.credit_limit)) : null,
    create_auto_ledger: body.create_auto_ledger !== undefined ? Boolean(body.create_auto_ledger) : true,
    visible_to_all_branches: body.visible_to_all_branches !== undefined ? Boolean(body.visible_to_all_branches) : true,
    add_all_vendors: Boolean(body.add_all_vendors),
    currency: str(body.currency) || "PKR",

    address_1: str(body.address_1),
    address_2: str(body.address_2),
    state: str(body.state),
    zip_code: str(body.zip_code),
    country: str(body.country) || "Pakistan",
    city: str(body.city),
    phone_1: str(body.phone_1),
    phone_2: str(body.phone_2),
    fax: str(body.fax),

    contact_persons,
    vendors: cleanVendors(body.vendors),

    contact_phone: str(body.phone_1) || firstContact?.cell_phone || firstContact?.phone || "",
    contact_email: str(body.business_email) || firstContact?.email || "",
  };

  if (fields.credit_limit !== null && Number.isNaN(fields.credit_limit)) fields.credit_limit = null;

  const missing: string[] = [];
  if (!fields.code) missing.push("Code");
  if (!fields.name) missing.push("Title");
  if (!fields.gl_account) missing.push("GL Account");
  contact_persons.forEach((c, i) => {
    if (!c.name) missing.push(contact_persons.length > 1 ? `Contact Person ${i + 1} Name` : "Contact Person Name");
  });

  return { fields, missing };
}

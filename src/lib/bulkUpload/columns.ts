// Spreadsheet column definitions shared by template download and upload parsing.

export type CellKind = "text" | "number" | "date" | "time";

export interface ColumnDef {
  key: string;
  header: string;
  required?: boolean;
  /** Required, but a blank cell is filled in from other columns (checked after that). */
  derivable?: boolean;
  kind?: CellKind;
  /** Allowed values; becomes an in-cell dropdown in the template and is checked on upload. */
  options?: readonly string[];
  /** Short help shown as a cell note on the header. */
  note?: string;
  width?: number;
}

export type RowValues = Record<string, string>;

export interface RowError {
  row: number;
  message: string;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Read a cell value from exceljs into plain text (dates → YYYY-MM-DD, times → HH:MM). */
export function cellText(value: unknown, kind: CellKind = "text"): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    if (kind === "time") return `${pad2(value.getUTCHours())}:${pad2(value.getUTCMinutes())}`;
    return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`;
  }
  if (typeof value === "object") {
    const v = value as { text?: unknown; result?: unknown; richText?: { text: string }[]; hyperlink?: string };
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("").trim();
    if (v.result !== undefined) return cellText(v.result, kind);
    if (v.text !== undefined) return cellText(v.text, kind);
    return "";
  }
  return String(value).trim();
}

/** Accept DD-MM-YYYY (also / or .) or an ISO date; return YYYY-MM-DD or "" when invalid. */
export function parseDate(text: string): string {
  const t = text.trim();
  if (!t) return "";
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return validYmd(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return validYmd(+m[3], +m[2], +m[1]);
  return "";
}

function validYmd(y: number, mo: number, d: number): string {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return "";
  return `${y}-${pad2(mo)}-${pad2(d)}`;
}

export function parseTime(text: string): string {
  const m = text.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m || +m[1] > 23 || +m[2] > 59) return "";
  return `${pad2(+m[1])}:${m[2]}`;
}

/**
 * Check one row against its column definitions: required values, numbers, dates, times
 * and dropdown values. Returns readable problems ("Customer Code is missing").
 */
export function checkRow(row: RowValues, columns: ColumnDef[]): string[] {
  const problems: string[] = [];
  for (const c of columns) {
    const v = (row[c.key] || "").trim();
    if (!v) {
      if (c.required && !c.derivable) problems.push(`${c.header} is missing`);
      continue;
    }
    if (c.kind === "number" && !Number.isFinite(Number(v.replace(/,/g, "")))) problems.push(`${c.header} must be a number`);
    if (c.kind === "date" && !parseDate(v)) problems.push(`${c.header} must be a date (DD-MM-YYYY)`);
    if (c.kind === "time" && !parseTime(v)) problems.push(`${c.header} must be a time (HH:MM)`);
    if (c.options && !c.options.some((o) => o.toLowerCase() === v.toLowerCase())) {
      problems.push(`${c.header} must be one of: ${c.options.join(", ")}`);
    }
  }
  return problems;
}

/** Normalise a row's values: numbers without commas, dates ISO, times HH:MM, options in canonical case. */
export function normaliseRow(row: RowValues, columns: ColumnDef[]): RowValues {
  const out: RowValues = { ...row };
  for (const c of columns) {
    const v = (row[c.key] || "").trim();
    if (!v) {
      out[c.key] = "";
      continue;
    }
    if (c.kind === "number") out[c.key] = String(Number(v.replace(/,/g, "")));
    else if (c.kind === "date") out[c.key] = parseDate(v);
    else if (c.kind === "time") out[c.key] = parseTime(v);
    else if (c.options) out[c.key] = c.options.find((o) => o.toLowerCase() === v.toLowerCase()) || v;
    else out[c.key] = v;
  }
  return out;
}

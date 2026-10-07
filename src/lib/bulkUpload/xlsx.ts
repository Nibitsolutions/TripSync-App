import ExcelJS from "exceljs";
import { cellText, ColumnDef, RowValues } from "./columns";

// Templates carry a hidden meta sheet so an upload can be matched to the page it was made for
const META_SHEET = "_meta";
const META_MARK = "tripsync-bulk-template";
const TEMPLATE_VERSION = "1";
const DATA_SHEET = "Upload";
const MAX_ROWS = 1000;

const REQUIRED_FILL = "FFF6C26B"; // amber
const OPTIONAL_FILL = "FFE5E7EB"; // light grey

export type TemplateKind = "invoice" | "voucher";

export async function buildTemplate(opts: {
  kind: TemplateKind;
  type: string;
  title: string;
  columns: ColumnDef[];
  groupKey: string;
  groupLabel: string;
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "TripSync";

  const ws = wb.addWorksheet(DATA_SHEET, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = opts.columns.map((c) => ({
    header: c.required ? `${c.header} *` : c.header,
    key: c.key,
    width: c.width ?? Math.max(12, c.header.length + 4),
  }));

  opts.columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    // Data cells stay editable; only the header row is locked
    col.protection = { locked: false };
    if (c.kind === "date") col.numFmt = "dd-mm-yyyy";
    else if (c.kind === "time") col.numFmt = "hh:mm";
    else if (c.kind !== "number") col.numFmt = "@"; // keep codes / ticket numbers as text

    const head = ws.getCell(1, i + 1);
    head.font = { bold: true, color: { argb: "FF111827" } };
    head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: c.required ? REQUIRED_FILL : OPTIONAL_FILL } };
    head.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    head.protection = { locked: true };
    const noteParts = [c.required ? "Required" : "Optional", c.note, c.options ? `Allowed: ${c.options.join(", ")}` : ""].filter(Boolean);
    head.note = noteParts.join("\n");

    if (c.options) {
      for (let r = 2; r <= MAX_ROWS + 1; r++) {
        ws.getCell(r, i + 1).dataValidation = {
          type: "list",
          allowBlank: !c.required,
          formulae: [`"${c.options.join(",")}"`],
          showErrorMessage: true,
          errorTitle: c.header,
          error: `Choose one of: ${c.options.join(", ")}`,
        };
      }
    }
  });
  ws.getRow(1).height = 32;
  // Columns are fixed: no inserting / deleting columns, but rows can be added and edited freely
  await ws.protect("", {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: true,
    formatColumns: true,
    insertRows: true,
    deleteRows: true,
    sort: true,
    autoFilter: true,
  });

  const help = wb.addWorksheet("Read Me");
  help.columns = [{ width: 110 }];
  const lines: Array<[string, Partial<ExcelJS.Style>?]> = [
    [opts.title, { font: { bold: true, size: 14 } }],
    [""],
    ["Legend", { font: { bold: true } }],
    ["Amber header (*)  = required: a row missing any of these is skipped and reported.", { fill: { type: "pattern", pattern: "solid", fgColor: { argb: REQUIRED_FILL } } }],
    ["Grey header        = optional.", { fill: { type: "pattern", pattern: "solid", fgColor: { argb: OPTIONAL_FILL } } }],
    [""],
    ["Rules", { font: { bold: true } }],
    [`• Fill the "${DATA_SHEET}" sheet. Do not rename, add or remove columns.`],
    [`• Rows with the same "${opts.groupLabel}" are created as one ${opts.kind}. If any row of a group is invalid, the whole group is skipped.`],
    ["• Dates as DD-MM-YYYY, times as HH:MM. Hover a header to see its help."],
    [`• This file is only for ${opts.title}. Upload it on that page; other types are rejected.`],
    [`• Everything uploaded is saved as Draft. Post it afterwards, one by one or with Batch Posting.`],
  ];
  lines.forEach(([text, style], i) => {
    const cell = help.getCell(i + 1, 1);
    cell.value = text;
    if (style) Object.assign(cell, { style: { ...cell.style, ...style } });
  });

  const meta = wb.addWorksheet(META_SHEET, { state: "veryHidden" });
  meta.getCell("A1").value = META_MARK;
  meta.getCell("A2").value = opts.kind;
  meta.getCell("A3").value = opts.type;
  meta.getCell("A4").value = TEMPLATE_VERSION;

  wb.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: 0, visibility: "visible" }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export interface ParsedUpload {
  kind: string | null;
  type: string | null;
  rows: Array<{ row: number; values: RowValues }>;
  missingHeaders: string[];
}

/** Read an uploaded template: its meta (kind / type) and the non-empty data rows keyed by column. */
export async function parseUpload(buffer: ArrayBuffer, columns: ColumnDef[]): Promise<ParsedUpload> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const meta = wb.getWorksheet(META_SHEET);
  const isTemplate = meta && cellText(meta.getCell("A1").value) === META_MARK;
  const kind = isTemplate ? cellText(meta!.getCell("A2").value) : null;
  const type = isTemplate ? cellText(meta!.getCell("A3").value) : null;

  const ws = wb.getWorksheet(DATA_SHEET) ?? wb.worksheets[0];
  const headerIndex = new Map<string, number>();
  ws.getRow(1).eachCell((cell, colNumber) => {
    headerIndex.set(cellText(cell.value).replace(/\s*\*$/, "").trim().toLowerCase(), colNumber);
  });
  const missingHeaders = columns.filter((c) => !headerIndex.has(c.header.toLowerCase())).map((c) => c.header);

  const rows: ParsedUpload["rows"] = [];
  if (missingHeaders.length === 0) {
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const values: RowValues = {};
      let any = false;
      for (const c of columns) {
        const v = cellText(row.getCell(headerIndex.get(c.header.toLowerCase())!).value, c.kind);
        values[c.key] = v;
        if (v) any = true;
      }
      if (any) rows.push({ row: r, values });
    }
  }
  return { kind, type, rows, missingHeaders };
}

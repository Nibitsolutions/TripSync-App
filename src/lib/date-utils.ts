/**
 * Platform-wide Date Formatting Utilities
 * Standard display format: DD-MM-YYYY (e.g. 05-09-2026 for 5th September 2026)
 * Internal storage format: YYYY-MM-DD
 */

/**
 * Format any date input (YYYY-MM-DD, ISO string, Date object, or DD-MM-YYYY) into DD-MM-YYYY string.
 */
export function formatDateDDMMYYYY(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return "";

  if (typeof dateInput === "string") {
    const trimmed = dateInput.trim();
    if (!trimmed) return "";

    // If already DD-MM-YYYY
    if (/^\d{2}-\d{2}-\d{4}$/.test(trimmed)) {
      return trimmed;
    }

    // YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss...
    const ymdMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (ymdMatch) {
      const [, yyyy, mm, dd] = ymdMatch;
      return `${dd}-${mm}-${yyyy}`;
    }

    // Try parsing with Date constructor
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      const dd = String(parsed.getDate()).padStart(2, "0");
      const mm = String(parsed.getMonth() + 1).padStart(2, "0");
      const yyyy = parsed.getFullYear();
      return `${dd}-${mm}-${yyyy}`;
    }

    return trimmed;
  }

  if (dateInput instanceof Date && !isNaN(dateInput.getTime())) {
    const dd = String(dateInput.getDate()).padStart(2, "0");
    const mm = String(dateInput.getMonth() + 1).padStart(2, "0");
    const yyyy = dateInput.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  }

  return "";
}

/**
 * Parse a string in DD-MM-YYYY or YYYY-MM-DD format to YYYY-MM-DD string.
 */
export function parseDDMMYYYYToYYYYMMDD(dateStr: string): string {
  if (!dateStr) return "";
  const trimmed = dateStr.trim();

  // Match DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    const [, dd, mm, yyyy] = dmyMatch;
    const day = dd.padStart(2, "0");
    const month = mm.padStart(2, "0");
    return `${yyyy}-${month}-${day}`;
  }

  // Match YYYY-MM-DD
  const ymdMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (ymdMatch) {
    const [, yyyy, mm, dd] = ymdMatch;
    const month = mm.padStart(2, "0");
    const day = dd.padStart(2, "0");
    return `${yyyy}-${month}-${day}`;
  }

  return trimmed;
}

/**
 * Format a Date object into YYYY-MM-DD format for input/model state.
 */
export function formatYYYYMMDD(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${yyyy}-${mm}-${dd}`;
}

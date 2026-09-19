// IATA 3-Digit Accounting Codes to Airline Information Mapping
export interface IATAAirlineInfo {
  code: string; // 3-digit prefix, e.g. "157"
  iata2: string; // 2-letter IATA code, e.g. "QR"
  name: string; // Airline Name
}

export const IATA_AIRLINES: Record<string, IATAAirlineInfo> = {
  "157": { code: "157", iata2: "QR", name: "QATAR AIRWAYS" },
  "214": { code: "214", iata2: "PK", name: "PAKISTAN INTERNATIONAL AIRLINES" },
  "176": { code: "176", iata2: "EK", name: "EMIRATES" },
  "607": { code: "607", iata2: "EY", name: "ETIHAD AIRWAYS" },
  "065": { code: "065", iata2: "SV", name: "SAUDIA" },
  "074": { code: "074", iata2: "KL", name: "KLM ROYAL DUTCH AIRLINES" },
  "125": { code: "125", iata2: "BA", name: "BRITISH AIRWAYS" },
  "220": { code: "220", iata2: "LH", name: "LUFTHANSA" },
  "235": { code: "235", iata2: "TK", name: "TURKISH AIRLINES" },
  "057": { code: "057", iata2: "AF", name: "AIR FRANCE" },
  "724": { code: "724", iata2: "LX", name: "SWISS INTERNATIONAL" },
  "016": { code: "016", iata2: "UA", name: "UNITED AIRLINES" },
  "001": { code: "001", iata2: "AA", name: "AMERICAN AIRLINES" },
  "006": { code: "006", iata2: "DL", name: "DELTA AIR LINES" },
  "081": { code: "081", iata2: "QF", name: "QANTAS" },
  "580": { code: "580", iata2: "VS", name: "VIRGIN ATLANTIC" },
  "217": { code: "217", iata2: "TG", name: "THAI AIRWAYS" },
  "232": { code: "232", iata2: "MH", name: "MALAYSIA AIRLINES" },
  "618": { code: "618", iata2: "SQ", name: "SINGAPORE AIRLINES" },
  "098": { code: "098", iata2: "AI", name: "AIR INDIA" },
  "229": { code: "229", iata2: "KU", name: "KUWAIT AIRWAYS" },
  "910": { code: "910", iata2: "WY", name: "OMAN AIR" },
  "072": { code: "072", iata2: "GF", name: "GULF AIR" },
  "160": { code: "160", iata2: "CX", name: "CATHAY PACIFIC" },
  "236": { code: "236", iata2: "9P", name: "FLY JINNAH" },
  "574": { code: "574", iata2: "PA", name: "AIRBLUE" },
  "803": { code: "803", iata2: "ER", name: "SERENE AIR" },
  "999": { code: "999", iata2: "PF", name: "AIR SIAL" },
  "512": { code: "512", iata2: "RA", name: "ROYAL NEPAL AIRLINES" },
  "055": { code: "055", iata2: "AZ", name: "ITA AIRWAYS" },
  "082": { code: "082", iata2: "SN", name: "BRUSSELS AIRLINES" },
  "147": { code: "147", iata2: "AT", name: "ROYAL AIR MAROC" },
};

// Default Airports and City Codes
export interface CityAirportCode {
  code: string;
  name: string;
  country: string;
}

export const CITY_AIRPORT_CODES: CityAirportCode[] = [
  { code: "ISB", name: "Islamabad", country: "Pakistan" },
  { code: "DXB", name: "Dubai", country: "United Arab Emirates" },
  { code: "LHE", name: "Lahore", country: "Pakistan" },
  { code: "KHI", name: "Karachi", country: "Pakistan" },
  { code: "PEW", name: "Peshawar", country: "Pakistan" },
  { code: "MUX", name: "Multan", country: "Pakistan" },
  { code: "SKT", name: "Sialkot", country: "Pakistan" },
  { code: "UET", name: "Quetta", country: "Pakistan" },
  { code: "JED", name: "Jeddah", country: "Saudi Arabia" },
  { code: "MED", name: "Madinah", country: "Saudi Arabia" },
  { code: "RUH", name: "Riyadh", country: "Saudi Arabia" },
  { code: "DMM", name: "Dammam", country: "Saudi Arabia" },
  { code: "DOH", name: "Doha", country: "Qatar" },
  { code: "AUH", name: "Abu Dhabi", country: "United Arab Emirates" },
  { code: "SHJ", name: "Sharjah", country: "United Arab Emirates" },
  { code: "MCT", name: "Muscat", country: "Oman" },
  { code: "KWI", name: "Kuwait City", country: "Kuwait" },
  { code: "BAH", name: "Bahrain", country: "Bahrain" },
  { code: "IST", name: "Istanbul", country: "Turkey" },
  { code: "LHR", name: "London Heathrow", country: "United Kingdom" },
  { code: "MAN", name: "Manchester", country: "United Kingdom" },
  { code: "JFK", name: "New York (JFK)", country: "United States" },
  { code: "YYZ", name: "Toronto", country: "Canada" },
  { code: "BKK", name: "Bangkok", country: "Thailand" },
  { code: "KUL", name: "Kuala Lumpur", country: "Malaysia" },
  { code: "SIN", name: "Singapore", country: "Singapore" },
  { code: "CAN", name: "Guangzhou", country: "China" },
];

/**
 * Format raw ticket number string into 3-4-3-3 pattern:
 * e.g. "1572127850017" -> "157-2127-850-017"
 */
export function formatTicketNumber(val: string): string {
  const digits = val.replace(/\D/g, "").slice(0, 13);
  const parts: string[] = [];

  if (digits.length > 0) parts.push(digits.slice(0, 3));
  if (digits.length > 3) parts.push(digits.slice(3, 7));
  if (digits.length > 7) parts.push(digits.slice(7, 10));
  if (digits.length > 10) parts.push(digits.slice(10, 13));

  return parts.join("-");
}

/**
 * Increment ticket number by 1 while preserving formatting
 * e.g. "157-2127-850-017" -> "157-2127-850-018"
 * e.g. "157" -> "158"
 */
export function incrementTicketNumber(ticketNo: string): string {
  if (!ticketNo || !ticketNo.trim()) return "";
  const clean = ticketNo.trim();
  const digitsOnly = clean.replace(/\D/g, "");
  if (!digitsOnly) return clean;

  try {
    const num = BigInt(digitsOnly) + BigInt(1);
    const numStr = num.toString().padStart(digitsOnly.length, "0");
    if (clean.includes("-")) {
      return formatTicketNumber(numStr);
    }
    return numStr;
  } catch {
    return clean;
  }
}

/**
 * Lookup Airline info from the ticket number's first 3 digits
 */
export function getAirlineByTicketNumber(ticketNo: string): IATAAirlineInfo | null {
  const digits = ticketNo.replace(/\D/g, "");
  if (digits.length < 3) return null;
  const prefix = digits.slice(0, 3);
  return IATA_AIRLINES[prefix] || null;
}

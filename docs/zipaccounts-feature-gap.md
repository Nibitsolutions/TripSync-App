# ZipAccounts vs TripSync — Feature Gap Report

- **Explore ki tareekh:** 30 Sep 2026
- **Source:** `https://zipaccounts.com/app4/` (company: Trip Sync)
- **Tareeqa:** Sidebar ke tamam groups aur top navbar ke 7 mega-menus khole gaye. Har page sirf dekha gaya, kuch save ya submit nahi kiya.
- **Muqabla:** `tripsync-app` ke routes aur models se (`src/app/dashboard/*`, `src/models/*`).

**Nishan:** ❌ = hamare paas nahi · ⚠️ = hamare paas hai lekin adhoora · ✅ = hamare paas hai

---

## 1. ZipAccounts ka poora menu (reference)

### 1.1 Top navbar (mega-menus)
Har voucher type ke saath aam tor par ye options hain: **Add / View / View UnPosted / View Void / View Refund**.

| Menu | Sub-items |
|---|---|
| **Finance Voucher** | Journal, Bank, Cash, Payment, Receipt, Manual Receipt, Foreign Payment, Foreign Receiving |
| **Visa Voucher** | Visa Voucher, Multi Supplier Visa, Refund Visa, Multi Visa |
| **Hotel Voucher** | Hotel, Refund Hotel, Multi Hotel |
| **Ticket Voucher** | Ticket, Multi Ticket, Refund Ticket, Quick Refund, Quick Ticket, Foreign Ticket (+ Foreign Refund), Void Ticket Charges, Ticket Refund Voucher |
| **Other Voucher** | Other, Refund Other, Multi Other, **Query Quotation Form**, Insurance |
| **Transport Voucher** | Transport, Refund Transport, Cruise |
| **Package Voucher** | Package (Umrah), Multi Supplier Package, Multi Supplier Package BreakDown, Manual Voucher, Short Umrah |

Code mein do aur menus maujood hain jo is user ko nazar nahi aate: **Tailor Voucher** aur **Customer Invoice**. Shayad ye kisi aur business type ke liye hain.

### 1.2 Dashboard ke upar voucher buttons
Journal, Cash, Payment, Bank, Visa, Hotel, Ticket, Quick Ticket, Other, Transport, Package, Foreign Ticket, Umrah, Short Umrah, Cruise, Insurance.

### 1.3 Sidebar
| Group | Pages |
|---|---|
| — | Dashboard, Sale Graphs, Chart of Account, Ledger, Package Brochure |
| **Finance Reports** | Expense Report (monthly), Income Report, Daily Expense, Daily Income, Monthly Profit, Daily Cash Activity, Financial Activity |
| **Trial Balance** | Trial Balance, Detailed Trial Balance, **Balance Sheet**, Detailed Balance Sheet, **Payable Report**, **Receivable Report** |
| **Reports** | Daily Activity, All Void Vouchers, Check-In Wise Hotel, Foreign Currency Sales, Consultant Sales, Consultant Sales Comparison, Customer/Supplier Sales, Top Customer, Top Supplier, Voucher Reconciliation, Detailed Sales, Manual Financials |
| **Airlines Reports** | Sales With Taxes, Supplier PSF, Refund With Taxes, Sales & Refund (Airline), BSP Report |
| **Sales Register** | Hotel, Visa, Ticket, Transport, Other, Country-wise Visa Sales |
| **Aging** | Add Aging, Add Supplier Aging, View Aging List, View Aging Report, View Supplier Aging, Customer-wise Aging, Daily Sales Pending (Daily Payment Report) |
| **Invoices** | Multiple Invoice, Multiple Ticket Invoice (with taxes) |
| **Closing Voucher** | Closing Voucher, View Closing Voucher |
| **User Settings** | Company Profile, Change Password, User Management (Branches & Users), Consultants, Airlines, Saudi Contact Details, Shirka, Hotel, Room Type, Visa Type, Activity Logs, Backup System |

---

## 2. Missing features — tafseel

### 2.1 Accounting core (sab se ahem)
| Feature | ZipAccounts mein kya hai | Hamare paas |
|---|---|---|
| Chart of Accounts | Head → Sub Head 1 → Sub Head 2 → Account; har account ki opening Dr/Cr aur currency; print | ❌ |
| General Ledger | Kisi bhi account (Cash, Bank, Income, Expense…) ka Ledger aur Detailed Ledger | ⚠️ sirf Customer/Supplier ledger |
| Account Summaries | Cash In Hand, Bank, Admin Expenses, Travel Agents, Ticket/Visa/Hotel Suppliers ke alag summary pages | ❌ |
| Trial Balance | Date ke hisaab se, heads mein grouped closing Dr/Cr | ❌ |
| Detailed Trial Balance | GL code; Opening, Transaction aur Closing (Dr/Cr) summary ke saath | ❌ |
| Balance Sheet | Statement of Financial Position: Assets, Equity, Net Profit, Liabilities, notes ke saath | ❌ |
| Detailed Balance Sheet | Account level breakdown | ❌ |
| Payable / Receivable Report | Kisi bhi date par jin accounts ka balance payable/receivable hai | ⚠️ sirf basic aging |
| Closing Voucher | Closing date par balances load karna, Dr/Cr adjust karna, closing ka farq | ❌ |
| Voucher Reconciliation | Jin vouchers mein Dr aur Cr barabar nahi un ki list | ❌ |
| All Void Vouchers | Tamam void vouchers aik jagah | ⚠️ status hai, alag report nahi |
| Unposted voucher lists | Har finance voucher ki "UnPosted" list | ⚠️ Draft status hai, alag view nahi |
| Manual Financials | Manual Cash In/Out aur Bank In/Out sheet | ❌ |

### 2.2 Finance vouchers
| Voucher | Tafseel | Hamare paas |
|---|---|---|
| Journal Voucher | Multi-row Dr/Cr, har row par image upload, farq dikhata hai | ⚠️ JV hai; row par image nahi |
| Cash Voucher | Cash In Hand account; Receipt/Payment rows; closing cash | ❌ (alag type nahi) |
| Bank Voucher | Bank account ke hisaab se | ❌ |
| Payment / Receipt | — | ✅ PV / RV |
| Manual Receipt Voucher | Naam, reference, travel date, ticket & sector, package, deal; receipt rows (cash + bank received, due balance) | ❌ |
| Foreign Payment / Foreign Receiving | Foreign amount, ROE, currency se PKR; file upload | ❌ |

### 2.3 Service vouchers (travel)
| Feature | Tafseel | Hamare paas |
|---|---|---|
| **Multi vouchers** | Multi Ticket, Multi Visa, Multi Hotel, Multi Other: aik voucher mein kai items ("+ Add More") | ⚠️ check karna hai ke hamari invoice mein kai line items hain |
| **Refund vouchers** | Har type ka alag Refund: Ticket, Quick, Foreign, Visa, Hotel, Transport, Other. Ticket Refund mein "Refund to Customer" aur "Refund from Supplier" alag | ⚠️ CreditNote model hai, type-wise refund screens nahi |
| Void Ticket Charges Voucher | Void ki fees ka alag voucher | ❌ |
| Quick Ticket / Foreign Ticket | Chhote ya foreign-currency ticket forms | ❌ |
| **Copy Data from SABRE** | Ticket aur Multi Ticket form mein Sabre ka data paste karne se form khud bhar jata hai | ❌ (sirf "Sabre" GDS dropdown mein) |
| **Copy Passport Data** | Multi Visa mein passport ka data paste karna | ❌ |
| Ticket fields | Ticket issuance date, GDS PNR, Airline PNR, Sector Type, UMRAH/NON-UMRAH, ISSUE/REISSUE/EMD, One-way/Round-trip | ⚠️ kuch fields hain |
| Multi Visa fields | DOB, Passport Expiry, Visa Type, Travel/Return date, Nationality | ⚠️ |
| Multi Hotel fields | Country, City, Nights, Room Type, Meal, Adults/Children/Infant, har room har raat ka rate | ⚠️ |
| Transport fields | Vehicle type, capacity, luggage, **Driver name aur number** | ⚠️ |
| **Cruise / Ferry Voucher** | Cruise type, country, arrival/departure | ❌ |
| **Insurance Voucher** | Policy type/no, DOB, passport, **nominee ka naam aur rishta** | ⚠️ sirf template/tax type |
| Other Voucher | Consultant account ke saath incentive yes/no aur incentive amount | ⚠️ |
| Foreign currency har voucher par | Foreign price, ROE, currency, Net PKR, buying aur selling dono | ⚠️ ExchangeRate model hai |

### 2.4 Umrah / Package
| Feature | Tafseel | Hamare paas |
|---|---|---|
| **Umrah Package Voucher** | Tabs: Lead Info, Visa, Hotel, Ticket, Transport, Flight. Group head, departure/arrival, Manual No, Adult/Child/Infant; buying aur selling foreign currency mein; profit/loss | ⚠️ Umrah invoice type hai; package builder nahi |
| Short Umrah Voucher | Visa ke baghair package | ❌ |
| Multi Supplier Package | Har component ka alag supplier | ❌ |
| **Multi Supplier Package BreakDown** | Mazeed tabs **Ziyarat** aur **Other Expense**; consultant incentive; country | ❌ |
| Manual Voucher | Name source (company profile), Shirka, Saudi contact, passenger counts aur dates | ❌ |
| **Shirka** master | Logo ke saath list | ❌ |
| **Saudi Contact Details** master | Naam, phone, shehar, type, address | ❌ |
| **Package Brochure** | Package ka form, preview aur Print/PDF (trip info, flights, airline logo…) | ❌ |
| **Query Quotation Form** | Client/agency ke liye quotation: Tickets, Visas, Hotels (aur mazeed sections), har section ka total; View aur Void | ❌ |

### 2.5 Masters / Settings
| Feature | Hamare paas |
|---|---|
| Airlines master | ❌ |
| Hotel master (naam, shehar, mulk) | ❌ |
| Room Types master | ❌ |
| Visa Types master | ❌ |
| **Consultants** (user ke saath jure, sales aur incentive reports ke liye) | ⚠️ Team & Agents / Commissions |
| **Branches** (har branch ke alag users) | ⚠️ Customer mein branch type hai; user branches nahi |
| Company Profile (logo, seller cell/phone, NTN, LIC# jo reports par print hote hain) | ⚠️ Agency Details |
| **Activity Logs** screen (entity/action filter, active users) | ⚠️ AuditLog model hai, screen nahi |
| **Backup System** (poora DB download) | ❌ |
| Language chunne ka option | ❌ |

### 2.6 Dashboard
| Feature | Hamare paas |
|---|---|
| Account shortcut tiles: Cash in Hand, Bank, Admin Expenses, Travel Agents, Customers, Supplier, Ticket/Visa/Hotel Suppliers, Trial Balance, Daily Activity | ❌ |
| **8 quick search boxes:** Voucher ID, Pax Name, Ticket No, Phone, PNR, Ledger (account name), Cheque No, Passport No | ❌ |
| Sales report (Today / This Week / This Month / Custom), voucher type ke hisaab se | ⚠️ |
| **Upcoming Hotel Check-ins** (customer/supplier ke hisaab se) | ❌ |
| **Upcoming Travel Schedule** (flights) | ❌ |
| **Upcoming Transport** (pickup/drop-off time) | ❌ |
| **Visa Applications tracker:** Pending, Applied, Approved, Rejected, Canceled, Sent to Embassy, Delivered to Office/Customer, Completed | ❌ |
| **Sale Graphs:** Area/Line/Bar; buying, selling aur profit, voucher type ke hisaab se | ⚠️ Business Analytics |

### 2.7 Reports
| Report | Hamare paas |
|---|---|
| Monthly Expense / Income Report | ❌ |
| Daily Expense / Daily Income | ❌ |
| Monthly Profit (Financial) Report | ❌ |
| Daily Cash Activity / Financial Activity (opening, aaj aaya cash, aaj diya cash, haath mein cash) | ❌ |
| Daily Activity | ❌ |
| Check-In Wise Hotel Report (HCN, SCN, room type, supplier) | ❌ |
| Foreign Currency Sales | ❌ |
| Consultant Sales / Consultant Sales Comparison | ❌ |
| Customer/Supplier Sales | ⚠️ |
| Top Customer / Top Supplier (rank, har voucher type ki sale) | ❌ |
| Detailed Sales Report (summary: receivables, received, remaining) | ❌ |
| Sales Registers: Hotel, Visa, Ticket, Transport, Other | ❌ |
| Country-wise Visa Sales (buying/selling/profit) | ❌ |
| Airline Sales with Taxes / Refund with Taxes (airline, sector, GDS/BSP/Web filter) | ⚠️ WHT report |
| Supplier PSF Report | ⚠️ PSF field hai, report nahi |
| Sales & Refund (Airline) | ❌ |
| BSP Report (GDS filter) | ⚠️ BSP ka zikr code mein hai |

### 2.8 Aging
| Feature | Hamare paas |
|---|---|
| 3-step aging: account/date → credit voucher chuno → debit vouchers adjust karo (knock-off) | ❌ |
| Supplier Aging (add aur view) | ❌ |
| Aging List / Aging Report view | ⚠️ basic aging print |
| Customer-wise Aging dashboard (Settled / Partial / Unsettled invoices) | ❌ |
| Daily Payment / Sales Pending (settlement status, customer, consultant) | ❌ |

### 2.9 Invoices
| Feature | Hamare paas |
|---|---|
| **Multiple Invoice:** account aur tareekh chuno, har type ki invoices aik saath (Ticket, Quick, Multi, Refunds, Hotel, Visa, Insurance, Cruise, Other…). Options: bank accounts dikhayein, account details dikhayein, name source | ❌ |
| Multiple Ticket Invoice with Taxes | ❌ |

---

## 3. Jo hamare paas hai, ZipAccounts mein nahi
- Approval workflow (ApprovalRequest)
- Commissions module
- Tax Codes aur WHT Tax Report
- Debit Note (DN) aur Cash Deposit (CD) vouchers
- Multi-tenant (kai agencies) admin aur billing
- Payment allocation (payment ko kai invoices mein baantna)

---

## 4. Tajweez-shuda tarteeb (priority)

1. **Accounting foundation:** Chart of Accounts, General Ledger, Trial Balance, Balance Sheet, Payable/Receivable. Baqi tamam finance reports in par tiki hain.
2. **Finance vouchers:** Cash/Bank voucher, Foreign Payment/Receiving, Unposted aur Void lists, JV rows par attachment.
3. **Umrah Package** (Lead, Visa, Hotel, Ticket, Transport, Flight, Ziyarat) aur Shirka, Saudi Contacts, Hotel, Room Type aur Visa Type masters.
4. **Dashboard:** quick search boxes, upcoming schedules, Visa status tracker.
5. **Refund flows** har service type ke liye, aur Void Ticket Charges.
6. **Reports:** Sales Registers, Profit/Expense/Income, Consultant, Top Customer/Supplier, Airline tax aur BSP.
7. **Aging knock-off** (customer aur supplier).
8. **Multiple Invoice**, Query Quotation, Package Brochure.
9. **Admin:** Activity Logs screen, Branches, Backup, Cruise/Insurance vouchers.

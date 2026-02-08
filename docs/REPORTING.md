# Reporting — Suggested Reports for the Billing App

This document recommends which reports to add, in what order, and what each needs. All suggestions use **existing data** (invoices, invoice_items, products, customers); no new tables required.

---

## Priority overview

| Priority | Report | Why |
|----------|--------|-----|
| **1** | Sales summary (revenue by period) | Core “how much did I make?”; drives every other decision. |
| **2** | Invoice status summary | Quick health: how many draft / sent / paid and total amounts. |
| **3** | Top products (by quantity & revenue) | What sells; restock and pricing. |
| **4** | Top customers (by revenue) | Who to nurture; simple CRM view. |
| **5** | Outstanding (sent, not paid) | Cash flow; what’s due from whom. |
| **6** | GST / tax summary by period | India compliance; taxable value + tax for filing. |
| **7** | Revenue trend (e.g. last 6 months) | Simple time-series for growth view. |

---

## Report 1: Sales summary (revenue by period)

**What:** Total revenue in a chosen period (e.g. this month, last month, last 7 days, custom range).  
**Definition of “revenue”:** Sum of `invoices.total` where `status = 'paid'` and `invoice_date` in range (or `created_at` if you prefer).

**Why first:** Answers “How much did I make?” and is the base for comparisons and trends.

**Data:**  
- Filter: `invoices.tenant_id`, `invoices.status = 'paid'`, `invoices.invoice_date` (or created_at) between from/to.  
- Aggregate: `SUM(total)`, optionally `COUNT(*)` (number of paid invoices).

**UI:**  
- Dashboard or Reports: period selector (This month / Last month / Last 7 days / Custom from–to).  
- Single card/section: “Revenue: ₹X,XXX (N invoices)”.

**API:** e.g. `GET /api/reports/sales-summary?from=YYYY-MM-DD&to=YYYY-MM-DD` → `{ totalRevenue, invoiceCount, from, to }`.

---

## Report 2: Invoice status summary

**What:** Count and total amount by status: draft, sent, paid.

**Why:** One glance to see pipeline (drafts), pending (sent), and collected (paid).

**Data:**  
- Filter: `invoices.tenant_id`.  
- Group by: `invoices.status`.  
- For each status: `COUNT(*)`, `SUM(total)`.

**UI:**  
- Dashboard: 3 small cards or a compact table: Draft (count, total), Sent (count, total), Paid (count, total).

**API:** e.g. `GET /api/reports/invoice-summary` → `{ draft: { count, total }, sent: { count, total }, paid: { count, total } }`.

---

## Report 3: Top products (by quantity & revenue)

**What:** Products ranked by quantity sold and by revenue in a period (or all time).  
**Source:** Join `invoice_items` with `invoices` (only `status = 'paid'`), optionally filter by date. Group by product (product_id or description if product_id is null); sum quantity and amount.

**Why:** Identifies bestsellers and slow movers; helps restocking and pricing.

**Data:**  
- From `invoice_items` + `invoices`: `invoices.tenant_id`, `invoices.status = 'paid'`, optional date filter.  
- Join products for name (or use item description for ad‑hoc lines).  
- Group by product_id/description; `SUM(quantity)`, `SUM(amount)`.

**UI:**  
- Reports page: period selector; table columns e.g. Product, Quantity sold, Revenue; sort by quantity or revenue.

**API:** e.g. `GET /api/reports/top-products?from=...&to=...` → `{ data: [ { productId, productName, quantity, revenue } ], ... }`.

---

## Report 4: Top customers (by revenue)

**What:** Customers ranked by total paid invoice amount in a period (or all time).

**Why:** See who your biggest buyers are; focus on retention and follow‑ups.

**Data:**  
- Filter: `invoices.tenant_id`, `invoices.status = 'paid'`, optional date range.  
- Group by: `invoices.customer_id`.  
- Join customers for name; `SUM(invoices.total)`.

**UI:**  
- Reports page: period selector; table: Customer, Invoice count, Total paid.

**API:** e.g. `GET /api/reports/top-customers?from=...&to=...` → `{ data: [ { customerId, customerName, invoiceCount, totalPaid } ], ... }`.

---

## Report 5: Outstanding (sent, not paid)

**What:** List of invoices with status `sent` (and optionally draft if you want “to be sent”), with customer and amount. Total “due” = sum of those totals.

**Why:** Cash flow: what money is expected and from whom.

**Data:**  
- Filter: `invoices.tenant_id`, `invoices.status = 'sent'`.  
- Select: invoice id, number, date, customer_id, total; join customers for name.  
- Aggregate: `SUM(total)` for “Total outstanding”.

**UI:**  
- Dashboard or Reports: “Outstanding: ₹X,XXX” and a short table (or link to Invoices filtered by status=sent).

**API:** e.g. `GET /api/reports/outstanding` → `{ totalDue, invoices: [ { id, invoice_number, invoice_date, customer_name, total } ] }`.

---

## Report 6: GST / tax summary by period

**What:** For a date range, sum of taxable value (e.g. subtotal) and sum of tax (tax_amount) for **paid** invoices (or all invoices, depending on your policy). Optional: count of invoices.

**Why:** India: quick numbers for GST filing; one place to see taxable value and tax collected.

**Data:**  
- Filter: `invoices.tenant_id`, `invoices.status = 'paid'` (or include sent if you report on accrual), `invoice_date` in range.  
- Aggregate: `SUM(subtotal)`, `SUM(tax_amount)`, `COUNT(*)`.

**UI:**  
- Reports: period selector; “Taxable value (subtotal): ₹X,XXX”, “Tax collected: ₹X,XXX”, “Invoices: N”.  
- Only show section if tenant has tax % / GSTIN (or always show with zero).

**API:** e.g. `GET /api/reports/tax-summary?from=...&to=...` → `{ subtotal, taxAmount, invoiceCount, from, to }`.

---

## Report 7: Revenue trend (e.g. last 6 months)

**What:** Revenue per month (or week) for the last 6–12 months.  
**Revenue:** Same as Report 1 (paid invoices, by invoice_date or created_at).

**Why:** See growth or seasonality at a glance.

**Data:**  
- Filter: `invoices.tenant_id`, `invoices.status = 'paid'`.  
- Group by: month (e.g. `date_trunc('month', invoice_date)`).  
- Aggregate: `SUM(total)` per month.

**UI:**  
- Reports: simple bar or line chart (e.g. last 6 months); table below with Month, Revenue.

**API:** e.g. `GET /api/reports/revenue-trend?months=6` → `{ data: [ { month: '2025-01', revenue } ], ... }`.

---

## Where to put reports in the app

- **Dashboard (home):**  
  - Report 1 (Sales summary) and Report 2 (Invoice status summary) as cards/sections.  
  - Optionally Report 5 (Outstanding total + link to list).  
  - Keeps the first screen useful without a separate Reports page.

- **Reports page (new route `/reports`):**  
  - Period selector shared where relevant.  
  - Report 1 (with period), 2, 3 (Top products), 4 (Top customers), 5 (Outstanding), 6 (GST/tax summary), 7 (Revenue trend).  
  - Can start with 1–5 and add 6–7 when you add charts.

- **Invoices page:**  
  - Already has status filter and export CSV; no change required for basic reporting.

---

## Suggested implementation order

1. **Phase 1 — Dashboard + one API**  
   - Backend: `GET /api/reports/invoice-summary` (Report 2) and `GET /api/reports/sales-summary?from=&to=` (Report 1).  
   - Frontend: Dashboard cards for “Revenue (this month)”, “Draft / Sent / Paid” counts and totals.  
   - Small and immediately useful.

2. **Phase 2 — Outstanding + Reports page**  
   - Backend: `GET /api/reports/outstanding` (Report 5).  
   - Frontend: New `/reports` page with Sales summary (with period), Invoice summary, Outstanding (total + table).

3. **Phase 3 — Top products & customers**  
   - Backend: `GET /api/reports/top-products`, `GET /api/reports/top-customers` with optional from/to.  
   - Frontend: Add to Reports page with period selector and tables.

4. **Phase 4 — Tax + trend**  
   - Backend: `GET /api/reports/tax-summary`, `GET /api/reports/revenue-trend`.  
   - Frontend: GST/tax summary section; revenue trend as table + simple chart (e.g. CSS bars or a small chart library).

---

## API shape summary (suggested)

| Endpoint | Returns |
|----------|--------|
| `GET /api/reports/sales-summary?from=&to=` | `{ totalRevenue, invoiceCount, from, to }` |
| `GET /api/reports/invoice-summary` | `{ draft: { count, total }, sent: { count, total }, paid: { count, total } }` |
| `GET /api/reports/outstanding` | `{ totalDue, invoices: [{ id, invoice_number, invoice_date, customer_name, total }] }` |
| `GET /api/reports/top-products?from=&to=` | `{ data: [{ productId, productName, quantity, revenue }] }` |
| `GET /api/reports/top-customers?from=&to=` | `{ data: [{ customerId, customerName, invoiceCount, totalPaid }] }` |
| `GET /api/reports/tax-summary?from=&to=` | `{ subtotal, taxAmount, invoiceCount, from, to }` |
| `GET /api/reports/revenue-trend?months=6` | `{ data: [{ month, revenue }] }` |

All under the same auth middleware; `tenant_id` from JWT only.

---

## What we are *not* suggesting for now

- **Profit margin:** Would need cost per product; not in current schema.  
- **Aging (30/60/90 days overdue):** Requires “due date” and possibly payment terms; can add later.  
- **Multi-currency:** Revenue is in tenant currency; no FX.  
- **Inventory:** No stock levels in schema; “top products” is by sales, not stock.

You can add these later if the schema and product model evolve.

---

*Next step: implement Phase 1 (invoice summary + sales summary + Dashboard cards), then iterate.*

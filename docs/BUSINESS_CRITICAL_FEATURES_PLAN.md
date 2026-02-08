# Phase 2: Business-Critical Features (High Value) — Implementation Plan

**Goal:** Features shop owners expect from billing software.  
**Focus:** Payments & collections, tax & compliance (India GST), and reports.  
**Approach:** One area at a time; each step is shippable. Gateway integration is explicitly deferred.

---

## Overview

| # | Area | Summary |
|---|------|--------|
| **5** | Payments & Collections | Manual payment records (Cash/UPI/Bank), partial payments, balance tracking, payment history per invoice |
| **6** | Tax & Compliance | Multiple tax slabs per line item, CGST/SGST/IGST split (India), HSN/SAC per product, monthly tax summary |
| **7** | Reports (Owner Gold) | Daily/monthly sales, paid vs unpaid, customer-wise sales, export to CSV |

**Suggested order:** 5 (Payments) → 6 (Tax) → 7 (Reports). Payments unblocks “paid vs unpaid” and balance in reports; tax unblocks tax summary report.

---

## 5. Payments & Collections

**Order of implementation:**

### 5.1 Database: payments table and invoice amount_paid

- **Scope:** Record payments against invoices; support partial payments; track balance (total − amount_paid).
- **Tasks:**
  - **Migration:** Create `payments` table:
    - `id` (UUID, PK), `tenant_id` (UUID, NOT NULL, FK → tenants), `invoice_id` (UUID, NOT NULL, FK → invoices ON DELETE CASCADE)
    - `amount` (NUMERIC(12,2), NOT NULL, > 0)
    - `payment_method` (TEXT, NOT NULL) — e.g. `'cash'`, `'upi'`, `'bank_transfer'` (validate in API or use CHECK)
    - `reference` (TEXT, nullable) — UPI ref, cheque number, etc.
    - `paid_at` (DATE or TIMESTAMPTZ, NOT NULL, default now())
    - `created_at` (TIMESTAMPTZ, NOT NULL)
    - Indexes: `(tenant_id)`, `(invoice_id)`; tenant isolation on all reads/writes.
  - **Migration:** Add to `invoices`: `amount_paid` NUMERIC(12,2) NOT NULL DEFAULT 0. Balance = `total - amount_paid`. When `amount_paid >= total`, treat as fully paid (status can stay `sent` or be set to `paid`).
  - **Trigger or API responsibility:** On INSERT/DELETE of a payment, recompute `invoices.amount_paid = (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE invoice_id = ...)` and optionally set `invoices.status = 'paid'` when `amount_paid >= total`. Prefer doing this in the API (POST/DELETE payment handler) for clarity; optional DB trigger for consistency.
- **Done when:** Migrations applied; no API yet — schema ready for 5.2.

---

### 5.2 Backend: payment APIs

- **Scope:** Add payment to an invoice; list payments for an invoice; optionally delete last payment (for correction). Enforce tenant isolation.
- **Tasks:**
  - **POST /api/invoices/:id/payments**  
    Body: `{ amount, payment_method, reference?, paid_at? }`.  
    Validate: amount > 0, payment_method in (`cash`, `upi`, `bank_transfer`). Insert into `payments`; then set `invoices.amount_paid = SUM(payments.amount)` for that invoice and, if `amount_paid >= total`, set `invoices.status = 'paid'`. Return created payment and updated invoice (or 201 + payment).
  - **GET /api/invoices/:id**  
    Extend response to include `payments: Payment[]` (ordered by paid_at/created_at) and `amount_paid`, `balance` (computed: total - amount_paid). Or **GET /api/invoices/:id/payments** returning only payments; frontend can compute balance from invoice.total and sum(payments). Prefer including in GET invoice for simplicity.
  - **DELETE /api/invoices/:id/payments/:paymentId** (optional for MVP): Only allow if tenant owns invoice; recompute amount_paid and reset status to `sent` if amount_paid < total. Alternatively: “no delete” for audit trail and only “add payment” for corrections (refund as negative payment later if needed). For MVP, allow delete of a payment for corrections.
  - **Vercel + Express:** Implement same routes in both.
- **Done when:** Frontend can add a payment and see payment history and balance via existing or extended invoice API.

---

### 5.3 Frontend: record payment and payment history

- **Scope:** On invoice (print view or a dedicated “Payments” section), show balance due, list of payments, and “Record payment” with method (Cash / UPI / Bank transfer), amount, optional reference, date.
- **Tasks:**
  - **Invoice print view (or invoice detail):** Show “Balance due: ₹X” (total − amount_paid). If amount_paid >= total, show “Paid in full” and optionally hide “Record payment”.
  - **Payment history:** List payments (date, method, amount, reference) for the invoice. Use data from GET /api/invoices/:id (with payments array).
  - **Record payment:** Button opens modal (or inline form): amount (required), payment method (dropdown: Cash, UPI, Bank transfer), optional reference, paid_at (default today). Submit → POST /api/invoices/:id/payments; refetch invoice; show toast. Validate amount <= balance (and > 0).
  - **Optional:** “Mark as paid in full” shortcut that creates one payment for remaining balance with method selected.
- **Done when:** User can record partial or full payments; balance and history are visible; invoice can move to “paid” via payments.

---

### 5.4 Invoices list: show balance and partially paid

- **Scope:** Invoices list shows “Paid”, “Unpaid”, or “Partially paid” and optionally balance due.
- **Tasks:**
  - Backend: Ensure list endpoint returns `amount_paid` (and optionally `balance`) per invoice.
  - Frontend: In invoices list, display status or badge: “Paid” (amount_paid >= total), “Partially paid” (amount_paid > 0 and < total), “Unpaid” (amount_paid = 0). Optionally show balance in a column.
- **Done when:** List view reflects payment state and balance at a glance.

---

**Phase 5 checklist:** Migration (payments + amount_paid) → Payment APIs → Record payment UI + history → List balance/partially paid.

---

## 6. Tax & Compliance

**Order of implementation:**

### 6.1 Database: per-item tax and HSN/SAC

- **Scope:** Support multiple tax rates per invoice (per line item); add HSN/SAC code on products for compliance.
- **Tasks:**
  - **invoice_items:** Add `tax_percent` NUMERIC(5,2) NOT NULL DEFAULT 0 (snapshot per line; can differ from tenant default). Optionally add `gst_type` TEXT CHECK (gst_type IN ('intra', 'inter')) for India: intra = CGST+SGST, inter = IGST. If not added, derive from tenant or invoice-level “place of supply” later.
  - **products:** Add `hsn_sac_code` TEXT nullable (e.g. `998314`, `998313`). Length limit e.g. 20.
  - **invoices:** Keep existing `tax_percent` and `tax_amount` as invoice-level summary/totals. Recompute on save: subtotal from items; tax = sum over items (item.amount * item.tax_percent / 100) or use item-level tax_amount if added. For simplicity: each invoice_item has tax_percent; item tax_amount = amount * tax_percent/100; invoice tax_amount = sum(item tax_amount), invoice total = subtotal + tax_amount.
  - **Migration:** Add column invoice_items.tax_percent (default from tenant at migration time or 0); add products.hsn_sac_code.
- **Done when:** Schema supports per-item tax and HSN/SAC on products; invoice totals can be computed from item-level tax.

---

### 6.2 CGST / SGST / IGST split (India)

- **Scope:** For each line item (or invoice), store or compute CGST, SGST, IGST amounts for reporting and compliance.
- **Tasks:**
  - **Model:** Intra-state: CGST = SGST = (tax_percent/2)% of taxable value. Inter-state: IGST = tax_percent% of taxable value. Add to **invoice_items**: `gst_type` ('intra' | 'inter'); optionally `cgst_percent`, `sgst_percent`, `igst_percent` (each 0 or half/full of tax_percent) and `cgst_amount`, `sgst_amount`, `igst_amount` for clarity in reports. Alternative: store only `tax_percent` and `gst_type`; compute amounts in API/reports.
  - **Migration:** Add to invoice_items: `gst_type` TEXT CHECK (gst_type IN ('intra','inter')) DEFAULT 'intra'; optionally `cgst_amount`, `sgst_amount`, `igst_amount` (NUMERIC(12,2)) for stored split.
  - **Backend (create/update invoice):** When saving items, set each item’s tax_percent (from product or default tenant), gst_type (from invoice-level “place of supply” or tenant default). Compute and store cgst_amount, sgst_amount, igst_amount per item (intra: half each; inter: full in igst). Invoice-level tax_amount = sum of item tax amounts; optionally store invoice-level cgst/sgst/igst totals.
  - **Tenant or invoice:** Add “place of supply” or “GST type” at invoice level (intra vs inter) so all items follow same rule for a given invoice; or allow per-item override later.
- **Done when:** Invoices store or compute CGST/SGST/IGST per item (and optionally per invoice); ready for tax summary report.

---

### 6.3 Backend: invoice create/update with per-item tax

- **Scope:** Create/update invoice and items with tax_percent and gst_type per item; pull HSN/SAC from product when present.
- **Tasks:**
  - **POST /api/invoices** and **PATCH /api/invoices/:id:** Accept per item: `tax_percent?`, `gst_type?`, optional `hsn_sac_code?` (from product). Compute item amount; compute item tax (and CGST/SGST/IGST if stored); sum to invoice subtotal, tax_amount, total. Persist invoice_items with tax_percent, gst_type, and optional cgst/sgst/igst amounts.
  - **GET /api/invoices/:id:** Return items with tax_percent, gst_type, and HSN/SAC (from product or stored on item).
  - **Products:** GET/PATCH product include hsn_sac_code. Settings or product form: add HSN/SAC field.
- **Done when:** Invoices are created/edited with per-item tax and GST split; products have HSN/SAC.

---

### 6.4 Tax summary report (monthly)

- **Scope:** Report showing monthly tax summary: by month, totals for CGST, SGST, IGST (and/or by rate).
- **Tasks:**
  - **Backend:** New endpoint e.g. **GET /api/reports/tax-summary?from=YYYY-MM&to=YYYY-MM** (or month=YYYY-MM). Filter invoices by invoice_date in range; status in ('sent','paid') or all; sum cgst_amount, sgst_amount, igst_amount from invoice_items (or invoice) for that tenant. Return e.g. `{ period: { from, to }, byMonth: [ { month, cgst, sgst, igst, totalTax } ], totals: { cgst, sgst, igst } }`.
  - **Frontend:** Reports page or Settings/Reports section: “Tax summary” with month selector; table by month and totals; optional export CSV.
- **Done when:** User can view monthly tax summary and optionally export.

---

**Phase 6 checklist:** Migration (per-item tax, HSN/SAC, GST split) → Backend create/update with tax → Tax summary report API + UI.

---

## 7. Reports (Owner Gold)

**Order of implementation:**

### 7.1 Backend: sales and collections reports

- **Scope:** APIs for daily/monthly sales, paid vs unpaid, customer-wise sales. Reuse existing invoice list and extend with aggregations or new report endpoints.
- **Tasks:**
  - **GET /api/reports/sales?from=DATE&to=DATE&groupBy=day|month**  
    Filter invoices by tenant_id and invoice_date in range. Status filter: optional (default: sent + paid, or all).  
    - groupBy=day: aggregate by invoice_date; sum(total), sum(amount_paid), count.  
    - groupBy=month: same by year-month.  
    Return e.g. `{ groupBy, from, to, rows: [ { date|month, totalSales, totalCollected, invoiceCount } ], totals }`.
  - **GET /api/reports/paid-vs-unpaid** (or part of sales)  
    For date range: count and sum for “paid” (amount_paid >= total), “partially_paid”, “unpaid” (or sent/draft with balance). Return e.g. `{ paid: { count, sum }, partiallyPaid: { count, sum, balanceDue }, unpaid: { count, sum } }`.
  - **GET /api/reports/customer-wise?from=DATE&to=DATE**  
    Group by customer_id; sum(invoice.total) or sum(amount_paid); return customer name, id, total sales, total collected. Sort by total descending.
  - All report endpoints: tenant-scoped; require auth.
- **Done when:** Backend exposes sales, paid-vs-unpaid, and customer-wise report data.

---

### 7.2 Frontend: Reports page

- **Scope:** A “Reports” page (or section) with date range, daily/monthly sales, paid vs unpaid summary, customer-wise sales; all exportable to CSV.
- **Tasks:**
  - Add route **/reports** and nav link “Reports”.
  - **Sales report:** Date range picker; group by Day / Month; table: date (or month), total sales, total collected, invoice count; totals row. “Export CSV” button.
  - **Paid vs unpaid:** Same date range; cards or table: Paid (count + sum), Partially paid (count + sum + balance due), Unpaid (count + sum). “Export CSV” button.
  - **Customer-wise sales:** Date range; table: Customer name, Total sales, Total collected; sortable. “Export CSV” button.
  - **CSV export:** Reuse pattern from invoices CSV: GET with ?format=csv and same filters; or POST with body and return CSV. Prefer GET /api/reports/sales?format=csv&from=&to=&groupBy= for consistency.
- **Done when:** User can view daily/monthly sales, paid vs unpaid, and customer-wise sales, and export each to CSV.

---

### 7.3 Export reports to CSV

- **Scope:** Each report view has “Export to CSV” with sensible filename (e.g. sales-report-2025-01.csv).
- **Tasks:**
  - Backend: For each report endpoint, support **?format=csv** (or dedicated export endpoint) returning `text/csv` with headers and rows. Filename in Content-Disposition or frontend uses default name from date range.
  - Frontend: “Export CSV” calls API with format=csv (or download endpoint), then use existing download pattern (Blob, link click) with filename like `sales-report-{from}-{to}.csv`, `customer-sales-{from}-{to}.csv`.
- **Done when:** All three reports can be exported to CSV from the UI.

---

**Phase 7 checklist:** Report APIs (sales, paid-vs-unpaid, customer-wise) → Reports page UI → CSV export for each.

---

## Suggested overall order (one by one)

1. **5.1** Payments migration (payments table + amount_paid)
2. **5.2** Payment APIs (POST payment, GET invoice with payments)
3. **5.3** Record payment UI + payment history on invoice
4. **5.4** Invoices list: balance and partially paid
5. **6.1** Tax migration (per-item tax, HSN/SAC on products)
6. **6.2** CGST/SGST/IGST schema and logic
7. **6.3** Invoice create/update with per-item tax and HSN/SAC
8. **6.4** Tax summary report (API + UI)
9. **7.1** Report APIs (sales, paid-vs-unpaid, customer-wise)
10. **7.2** Reports page (sales, paid vs unpaid, customer-wise)
11. **7.3** Export reports to CSV

---

## Out of scope (for later)

- **Payment gateway integration:** Online payment links, gateways (Razorpay, Stripe, etc.) — explicitly deferred; manual recording first.
- **Refunds / negative payments:** Can be added later as negative amount or separate refund table.
- **Multi-currency payments:** Single currency per tenant for MVP.

---

*This plan aligns with APPLICATION_DESIGN.md and STABILITY_AND_TRUST_PLAN.md. Implement in order; each step is testable and shippable.*

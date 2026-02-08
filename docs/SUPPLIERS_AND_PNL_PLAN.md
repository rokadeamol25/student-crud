# Suppliers, Purchases & Profit & Loss — Implementation Plan

**Goal:** Foundation for P&L: suppliers, purchase bills, stock, cost snapshot on sales, gross profit, and simple P&L view.  
**Focus:** Supplier ledger, purchase recording (→ stock + last purchase price), COGS at sale time, profit calculation, P&L summary, dashboard, stock safeguards, minimal reports.  
**Out of scope (explicit):** Balance sheet, depreciation, FIFO/LIFO, tax in P&L.

---

## Overview

| # | Area | Summary |
|---|------|--------|
| **1** | Supplier & Purchase (Foundation) | Suppliers CRUD; purchase bills (supplier, bill #, date, items); status Draft/Recorded; paid tracking; on Recorded → stock ↑, last_purchase_price updated |
| **2** | COGS MVP | Cost = qty × last_purchase_price at sale time; store cost_price on invoice_item; never recalc later |
| **3** | Profit Calculation | Per invoice: sales total, cost total, gross profit, profit %; per product: qty sold, sales, cost, profit |
| **4** | P&L Summary Screen | One page: date range / month / FY; Total Sales, Total Purchases, Gross Profit, Profit % |
| **5** | Dashboard Additions | Today/Month Sales, Today/Month Purchases, Gross Profit |
| **6** | Stock Safeguards | Prevent/warn when selling more than stock; show stock in product list; optional low-stock highlight |
| **7** | Reports | Sales vs Purchase (totals + gross profit); Product Profit (table + CSV) |

**Suggested order:** 1 (Suppliers + Purchases + Stock columns) → 2 (COGS on invoice item) → 3 (Profit display) → 4 (P&L page) → 5 (Dashboard) → 6 (Stock safeguards) → 7 (Reports).

---

## 1. Supplier & Purchase (Foundation for P&L)

**Order of implementation:**

### 1.1 Database: products stock & last_purchase_price; suppliers; purchase_bills; purchase_bill_items; purchase_payments

- **Scope:** Products get stock quantity and last purchase price. New entities: suppliers, purchase bills (with items), and purchase payments for “total paid” / balance.
- **Tasks:**
  - **products:** Add `stock` NUMERIC(12,2) NOT NULL DEFAULT 0 (quantity on hand). Add `last_purchase_price` NUMERIC(12,2) nullable (last price paid when recording a purchase). Index or use as-is for “low stock” and sell checks.
  - **suppliers:** New table:
    - `id` (UUID, PK), `tenant_id` (UUID, NOT NULL, FK → tenants), `name` (TEXT, NOT NULL), `email`, `phone`, `address` (TEXT, nullable), `created_at` (TIMESTAMPTZ).
    - Index: `(tenant_id)`, `(tenant_id, name)`.
  - **purchase_bills:** New table:
    - `id`, `tenant_id`, `supplier_id` (FK → suppliers), `bill_number` (TEXT, NOT NULL), `bill_date` (DATE, NOT NULL), `status` (TEXT, NOT NULL) CHECK IN ('draft', 'recorded'), default 'draft'.
    - `amount_paid` NUMERIC(12,2) NOT NULL DEFAULT 0 (sum of purchase_payments).
    - `subtotal`, `total` (or compute from items); optional `notes` (TEXT).
    - UNIQUE(tenant_id, bill_number) or allow duplicate bill numbers from same supplier if needed — recommend UNIQUE(tenant_id, bill_number).
    - Indexes: (tenant_id), (supplier_id), (bill_date).
  - **purchase_bill_items:** New table:
    - `id`, `purchase_bill_id` (FK → purchase_bills ON DELETE CASCADE), `product_id` (FK → products), `quantity` (NUMERIC(12,2) NOT NULL, > 0), `purchase_price` (NUMERIC(12,2) NOT NULL, >= 0), `amount` (NUMERIC(12,2) NOT NULL).
    - Index: (purchase_bill_id).
  - **purchase_payments:** New table (like `payments` for invoices):
    - `id`, `tenant_id`, `purchase_bill_id` (FK → purchase_bills ON DELETE CASCADE), `amount`, `payment_method` (cash/upi/bank_transfer), `reference`, `paid_at`, `created_at`.
    - On insert/delete, recompute `purchase_bills.amount_paid`.
  - **Purchase bill totals:** Either store `subtotal`/`total` on purchase_bills (recomputed when items change) or compute from items in API. Prefer stored for consistency: when saving draft or recording, set subtotal/total from sum of items.
- **Done when:** Migration applied; schema ready for APIs.

---

### 1.2 Backend: Suppliers CRUD

- **Scope:** Create, list, get one, update, delete suppliers. Tenant-scoped.
- **Tasks:**
  - **GET /api/suppliers** — List with optional search (q), pagination (limit, offset). Response: `{ data: Supplier[], total }`.
  - **GET /api/suppliers/:id** — Single supplier.
  - **POST /api/suppliers** — Body: name, email?, phone?, address?. Return 201 + supplier.
  - **PATCH /api/suppliers/:id** — Same fields optional.
  - **DELETE /api/suppliers/:id** — Only if no purchase bills reference this supplier (or restrict to unused). Else 409.
  - Implement in Vercel (`api/suppliers/*`) and Express (`server/src/routes/suppliers.js`).
- **Done when:** Frontend can manage suppliers.

---

### 1.3 Backend: Purchase bills CRUD + “Record” action

- **Scope:** Create draft purchase bill (supplier, bill_number, bill_date, items: product_id, quantity, purchase_price). Update draft. “Record” action: set status = recorded, increase product stock by quantity per line, set product.last_purchase_price from that line’s purchase_price (per product: use latest in the bill or weighted avg — plan: **update last_purchase_price to the purchase_price of each item** when recording, so last purchase price is the most recent purchase price for that product from this bill). Recompute purchase_bill subtotal/total from items.
- **Tasks:**
  - **GET /api/purchase-bills** — List by tenant; filter by supplier_id?, status?; sort by bill_date desc. Include supplier name (join or embed). Response: `{ data: PurchaseBill[], total }`. Optionally include amount_paid / balance.
  - **GET /api/purchase-bills/:id** — Single bill with items and supplier. Return amount_paid, balance (total - amount_paid).
  - **POST /api/purchase-bills** — Body: supplier_id, bill_number, bill_date, items: [{ product_id, quantity, purchase_price }]. Validate supplier and products belong to tenant. Compute amount = quantity * purchase_price per line, subtotal/total. Insert as status 'draft'. Return 201 + bill with items.
  - **PATCH /api/purchase-bills/:id** — If draft: update supplier_id, bill_number, bill_date, items (replace items). Recompute subtotal/total. If recorded: no edit (or only allow paid flag / payment — no item change).
  - **POST /api/purchase-bills/:id/record** — Only if status = 'draft'. For each item: UPDATE products SET stock = stock + item.quantity, last_purchase_price = item.purchase_price WHERE id = item.product_id. Then set purchase_bill.status = 'recorded'. Return updated bill. (If multiple lines for same product, last_purchase_price = last line’s price; stock = sum of all lines for that product.)
  - **DELETE /api/purchase-bills/:id** — Only if draft. If recorded, 400.
  - **Purchase payments:** POST /api/purchase-bills/:id/payments (amount, payment_method, reference?, paid_at?), GET included in GET bill, DELETE payment for correction. Same pattern as invoice payments; recompute amount_paid on bill.
- **Done when:** User can create draft purchase bill, record it (stock and last_purchase_price updated), and record payments.

---

### 1.4 Frontend: Suppliers list + Create/Edit Supplier

- **Scope:** Suppliers page: list with search; add supplier form; edit (modal or inline). Nav link “Suppliers”.
- **Tasks:**
  - Route: `/suppliers`. Component: Suppliers (list + add form). Edit: modal with name, email, phone, address. Delete with confirm (only if no purchase bills).
  - Reuse patterns from Customers (list, add, edit, delete, confirm dialog).
- **Done when:** User can create, edit, and list suppliers.

---

### 1.5 Frontend: Purchase bills list + Create/Edit draft + Record + Payments

- **Scope:** Purchase bills page: list (supplier, bill number, date, status, total, balance); create draft (supplier, bill number, date, line items: product, qty, purchase price); edit draft; “Record” button (confirm); record payment (modal); view ledger per supplier.
- **Tasks:**
  - Route: `/purchase-bills`. List with filters (supplier, status). Create: form with supplier dropdown, bill number, date, items table (product dropdown, quantity, purchase price, amount). Edit draft: same. Record: confirm “Record this bill? Stock and last purchase price will be updated.” Then POST .../record. Payment: same UX as invoice payments (amount, method, date, reference).
  - **Supplier ledger (view):** From supplier detail or “Supplier ledger” link: show for one supplier — Total purchases (sum of recorded bill totals), Total paid (sum of payments or sum of amount_paid), Balance payable. Can be a dedicated page “Suppliers → [Name] → Ledger” or a section on supplier detail. API: GET /api/suppliers/:id/ledger or GET /api/purchase-bills?supplierId=x and compute totals client-side. Prefer GET /api/suppliers/:id/ledger returning { totalPurchases, totalPaid, balancePayable, bills: [...] }.
- **Done when:** User can create/edit/record purchase bills, record payments, and see supplier ledger (total purchases, total paid, balance).

---

## 2. Cost of Goods Sold (COGS) – MVP

**Order of implementation:**

### 2.1 Database: cost_price on invoice_items

- **Scope:** Snapshot cost at sale time so profit is never recalculated later.
- **Tasks:**
  - **invoice_items:** Add `cost_price` NUMERIC(12,2) NOT NULL DEFAULT 0 (cost per unit at sale time). Add `cost_amount` NUMERIC(12,2) NOT NULL DEFAULT 0 (quantity × cost_price). Alternatively only `cost_amount` and derive cost_price = cost_amount/quantity if needed. Prefer both for clarity: cost_price (per unit), cost_amount (line total).
  - Backfill: existing rows set cost_price = 0, cost_amount = 0 (no historical cost).
- **Done when:** Schema supports cost snapshot on invoice item.

---

### 2.2 Backend: Set cost when creating/updating invoice

- **Scope:** When saving an invoice (create or update draft), for each item with product_id: set cost_price = product.last_purchase_price (or 0 if null). Set cost_amount = quantity × cost_price. Persist on invoice_items.
- **Tasks:**
  - In POST /api/invoices and PATCH /api/invoices/:id (full body): when building each line item, after resolving product (name, price, tax_percent, hsn_sac_code), fetch product.last_purchase_price. cost_price = last_purchase_price ?? 0. cost_amount = round(quantity * cost_price, 2). Insert/update invoice_items with cost_price, cost_amount.
  - GET /api/invoices/:id: already returns items; ensure cost_price and cost_amount are in select (e.g. *).
- **Done when:** Every new or updated draft invoice has cost snapshot on each item.

---

### 2.3 Invoice totals: cost_total, gross_profit (optional on invoice)

- **Scope:** Invoice-level cost and profit for display and reporting.
- **Tasks:**
  - Option A: Add to `invoices` table: `cost_total` NUMERIC(12,2) NOT NULL DEFAULT 0, `gross_profit` NUMERIC(12,2) NOT NULL DEFAULT 0. Update when saving invoice from sum of item cost_amount; gross_profit = total - cost_total.
  - Option B: Do not store on invoice; compute when needed: cost_total = sum(invoice_items.cost_amount), gross_profit = total - cost_total. Simpler; use Option B for MVP unless you want to filter/sort by profit in DB.
  - Recommendation: **Option B** (compute from items). If later you need indexes on profit, add columns and backfill.
- **Done when:** Cost total and gross profit are available (computed from items) for invoice view and reports.

---

## 3. Profit Calculation (Simple & Honest)

### 3.1 Per-invoice display

- **Scope:** On invoice (print view and/or edit summary): show Sales total, Cost total, Gross profit, Profit %.
- **Tasks:**
  - **Invoice print view:** Below totals, add: Cost total = sum(invoice_items.cost_amount). Gross profit = total - cost_total. Profit % = total > 0 ? (gross_profit / total * 100) : 0. Display in a small “Profit” row or block.
  - **Edit invoice / invoice detail:** Same figures if available (from GET invoice items).
- **Done when:** User sees sales, cost, gross profit, and profit % on the invoice.

---

### 3.2 Per-product profit (basic)

- **Scope:** For each product: total quantity sold, total sales amount, total cost, profit. No FIFO/LIFO; use snapshot cost only.
- **Tasks:**
  - **Backend:** GET /api/reports/product-profit?from=&to= — From invoice_items (join invoices where status in ('sent','paid')), group by product_id. Sum quantity, amount (sales), cost_amount. Return product name, qty_sold, sales, cost, profit. Include “adhoc” lines (no product_id) as one row if needed.
  - **Frontend:** Use in Product Profit Report (see §7) and optionally on product detail if you add one.
- **Done when:** Product-level profit is available from report API.

---

## 4. Profit & Loss Summary Screen (MVP)

### 4.1 Backend: P&L summary API

- **Scope:** Single endpoint: total sales, total purchases, gross profit, profit % for a date range (or month / financial year).
- **Tasks:**
  - **GET /api/reports/pnl** or **GET /api/reports/profit-loss** — Query params: `from`, `to` (date), or `month=YYYY-MM`, or `fy=2024-2025` (interpret as Apr–Mar or Jan–Dec; define one). Filter invoices (status sent/paid) by invoice_date in range → sum(total) = Total Sales. Sum invoice_items.cost_amount for those invoices = Total Cost (COGS). Filter purchase_bills (status recorded) by bill_date in range → sum(total) = Total Purchases. Gross Profit = Total Sales - Total Cost (COGS). Profit % = Total Sales > 0 ? (Gross Profit / Total Sales * 100) : 0. Return: `{ from, to, totalSales, totalPurchases, totalCost (COGS), grossProfit, profitPercent }`.
  - Clarification: “Total Purchases” is spend on stock (purchase bills). “Total Cost” (COGS) is cost of goods sold (from sales invoice items). P&L shows both: Sales, COGS (cost of sales), Gross Profit = Sales - COGS; and separately Total Purchases (for context). So: totalSales, totalCost (COGS), grossProfit = totalSales - totalCost, profitPercent; and totalPurchases as additional info.
- **Done when:** API returns P&L figures for a period.

---

### 4.2 Frontend: P&L page

- **Scope:** One page: “Profit & Loss” or “P&L”. Filters: date range (from/to) or preset (This month, Last month, This financial year). Show only: Total Sales, Total Purchases (optional), Total Cost (COGS), Gross Profit, Profit %.
- **Tasks:**
  - Route: `/reports/pnl` or add a section to `/reports` as “P&L Summary”. Filters: from, to (or month dropdown, FY dropdown). Call GET /api/reports/pnl?from=&to=. Display four-five big numbers: Sales, Purchases, Cost (COGS), Gross Profit, Profit %. No balance sheet, no depreciation.
- **Done when:** User can open P&L, pick period, and see the five metrics.

---

## 5. Dashboard Additions (High Impact)

### 5.1 Backend: today / month sales and purchases

- **Scope:** Aggregates for “today” and “current month” for sales and purchases.
- **Tasks:**
  - **GET /api/reports/dashboard** or extend existing dashboard data: Today Sales = sum(invoices.total) where status in ('sent','paid') and invoice_date = today. Month Sales = same where invoice_date in current month. Today Purchases = sum(purchase_bills.total) where status = 'recorded' and bill_date = today. Month Purchases = same for current month. Gross Profit (today or month) = Sales - COGS (sum of invoice_items.cost_amount for those invoices). Return e.g. `{ todaySales, monthSales, todayPurchases, monthPurchases, todayGrossProfit, monthGrossProfit }`.
- **Done when:** API returns dashboard figures.

---

### 5.2 Frontend: Dashboard cards

- **Scope:** Update dashboard to show: Today Sales, Month Sales; Today Purchases, Month Purchases; Gross Profit (today, month).
- **Tasks:**
  - Add cards (or reuse card layout): Today’s sales, This month’s sales; Today’s purchases, This month’s purchases; Gross profit (today), Gross profit (month). Use formatMoney(tenant) for all.
- **Done when:** Shop owner sees sales, purchases, and gross profit at a glance on dashboard.

---

## 6. Stock Safeguards (Required for Correct P&L)

### 6.1 Enforce or warn on sell vs stock

- **Scope:** When creating/updating an invoice (draft), if an item has product_id and quantity > product.stock, either prevent save (hard validation) or show a clear warning and allow override (soft). Plan: **warn and allow** for MVP (e.g. “Quantity exceeds available stock (X). Proceed anyway?”). Option to make it strict later.
- **Tasks:**
  - **Backend:** On POST/PATCH invoice with items: for each item with product_id, load product.stock. If item.quantity > stock, either return 400 with message “Quantity for [product] exceeds stock (stock: X)” or add a flag allowExceedStock and only then allow. Recommendation: return 400 with clear message; frontend can show “Stock: X” next to quantity and block submit if qty > stock (or add “Allow excess” checkbox for override and send allowExceedStock: true).
  - **Frontend:** When selecting product and quantity, show “Stock: N”. If quantity > stock, show warning and optionally disable “Save” or require confirmation. If backend returns 400 for stock exceed, show toast with message.
- **Done when:** User cannot (or is warned when) sell more than available stock; product list or invoice form shows stock.

---

### 6.2 Show current stock in product list

- **Scope:** Products list (table) shows a “Stock” column with current quantity.
- **Tasks:**
  - **Backend:** GET /api/products already returns * (include stock after migration).
  - **Frontend:** Products table: add column “Stock” with product.stock. Optionally highlight row or show badge if stock &lt; threshold (e.g. &lt; 5 or &lt; 1) — “Low stock” or red number.
- **Done when:** Product list shows stock; optional low-stock highlight.

---

## 7. Reports (Minimal but Useful)

### 7.1 Sales vs Purchase report

- **Scope:** For date range: Sales total, Purchase total, Gross profit. Same as P&L but as a “report” (e.g. same API or alias).
- **Tasks:**
  - Reuse GET /api/reports/pnl?from=&to=. Frontend: “Sales vs Purchase” report section (or tab) with from/to and the same four-five numbers. Optional CSV: one row with from, to, totalSales, totalPurchases, totalCost, grossProfit, profitPercent.
- **Done when:** User can view and optionally export Sales vs Purchase summary for a range.

---

### 7.2 Product Profit report + CSV

- **Scope:** Table: Product name, Qty sold, Sales, Cost, Profit. Export CSV.
- **Tasks:**
  - **Backend:** GET /api/reports/product-profit?from=&to= — Already in §3.2. Add ?format=csv: return CSV with columns Product, Qty Sold, Sales, Cost, Profit.
  - **Frontend:** “Product Profit” report: date range, table (product name, qty sold, sales, cost, profit), “Export CSV” button.
- **Done when:** User can see product profit table and download CSV.

---

## Suggested Overall Order (One by One)

1. **1.1** Migration: products (stock, last_purchase_price); suppliers; purchase_bills; purchase_bill_items; purchase_payments  
2. **1.2** Suppliers CRUD API  
3. **1.3** Purchase bills API (CRUD + Record + payments)  
4. **1.4** Frontend: Suppliers page  
5. **1.5** Frontend: Purchase bills page + Supplier ledger  
6. **2.1** Migration: invoice_items (cost_price, cost_amount)  
7. **2.2** Backend: set cost on invoice create/update  
8. **2.3** Invoice cost_total / gross_profit (computed from items)  
9. **3.1** Frontend: Per-invoice profit display (sales, cost, profit, %)  
10. **3.2** Backend: Product profit report API  
11. **4.1** Backend: P&L summary API  
12. **4.2** Frontend: P&L summary page  
13. **5.1** Backend: Dashboard aggregates (today/month sales, purchases, profit)  
14. **5.2** Frontend: Dashboard cards  
15. **6.1** Backend + Frontend: Stock check on invoice (warn or block)  
16. **6.2** Frontend: Stock column + low-stock highlight in product list  
17. **7.1** Sales vs Purchase report (reuse P&L + optional CSV)  
18. **7.2** Product Profit report table + CSV export  

---

## Out of Scope (for this plan)

- Balance sheet  
- Depreciation  
- Tax calculation inside P&L (we only show gross profit; tax stays in invoice/reporting as today)  
- FIFO/LIFO / average cost (single last_purchase_price only)  
- Multi-warehouse or batch stock  

---

*This plan builds on APPLICATION_DESIGN.md and existing Payments, Tax, and Reports. Run migrations in order; each step is testable and shippable.*

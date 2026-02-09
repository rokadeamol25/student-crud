# How the P&L Report Is Generated (Detailed)

This document explains **exactly** how the Profit & Loss report is built: which tables and columns are used, how the period is chosen, and why each choice was made.

---

## 1. Two Variants: Accrual vs Cash

The app has **two** P&L endpoints:

| Endpoint | When revenue/cost is recognised | Use case |
|----------|--------------------------------|----------|
| **Accrual** (`GET /api/reports/pnl`) | When the **invoice** is dated (or when the bill is recorded) | “How did the business perform in this period?” (accounting view) |
| **Cash** (`GET /api/reports/pnl-cash`) | When **payment** actually happened (`paid_at`) | “How much money came in and went out in this period?” (cash view) |

Both use the **same date range** (`from`, `to`) from the query (or presets like “This month”, “This FY”).

---

## 2. Date Range (Both Reports)

- **Query params:** `from`, `to` (YYYY-MM-DD). Optional: `month=YYYY-MM` or `fy=YYYY-YYYY` (Indian FY Apr–Mar).
- **Default:** If not provided, the **current calendar month** (1st to last day).
- **Rule:** `from` must be ≤ `to`; otherwise the API returns 400.

So “P&L for February 2026” means: include only invoices (or payments) whose **date** falls in that range.

---

## 3. Accrual P&L (Step by Step)

### 3.1 Which invoices count?

- **Table:** `invoices`
- **Filters:**
  - `tenant_id = req.tenantId`
  - `status IN ('sent', 'paid')` — only issued invoices (drafts are ignored)
  - `invoice_date >= from` and `invoice_date <= to`

So: **revenue is recognised in the period where the invoice date falls**, not when the customer pays. That’s standard accrual accounting.

### 3.2 Total sales (revenue)

- **Source:** Same set of invoices as above.
- **Value used:** `invoices.subtotal` (not `invoices.total`).

**Why subtotal?**  
`total = subtotal + tax_amount`. Tax (GST) is collected on behalf of the government; it is **not your income**. So for P&L, “revenue” = value of sales **before tax**. That way:

- **Revenue** = what you earned from selling goods/services.
- **Gross profit** = revenue − cost of those sales (no tax in the formula).

The API also returns `totalSalesInclTax` (sum of `invoices.total`) so the UI can show “invoice total including tax” separately.

**Formula:**  
`totalSales = sum(invoices.subtotal)` for the filtered invoices, rounded to 2 decimals.

### 3.3 Total cost (COGS)

- **Source:** `invoice_items` for the **same** invoice IDs as above.
- **Value used:** `invoice_items.cost_amount` (per line).

**What is `cost_amount`?**  
When an invoice is created or updated (and saved as sent/paid), each line gets:

- `cost_price` = product’s **`last_purchase_price`** at that time (from the last **recorded** purchase bill).
- `cost_amount` = `quantity × cost_price` for that line.

So **cost is fixed at sale time**. If you had no purchase history for a product, `last_purchase_price` is null → `cost_price` is 0 → that line adds 0 to COGS.

**Formula:**  
`totalCost = sum(invoice_items.cost_amount)` for those invoice IDs, rounded to 2 decimals.

### 3.4 Total purchases (informational)

- **Table:** `purchase_bills`
- **Filters:** same tenant, `status = 'recorded'`, `bill_date` in `[from, to]`.
- **Value:** `sum(purchase_bills.total)`.

This is **not** used in the profit formula. It answers “how much did we buy in this period?” (for context). Profit uses **COGS** (cost of what we *sold*), not “what we bought”.

### 3.5 Gross profit and profit %

- **Gross profit** = `totalSales − totalCost` (both rounded to 2 decimals, then difference rounded).
- **Profit %** = `(grossProfit / totalSales) × 100` when `totalSales > 0`, else 0.

So:

- **Accrual revenue** = sum of **subtotals** of invoices **dated** in the period.
- **Accrual cost** = sum of **cost_amount** on lines of those same invoices (cost as at sale time).
- **Accrual profit** = that revenue − that cost; tax is never part of revenue or cost here.

---

## 4. Cash P&L (Step by Step)

### 4.1 Which payments count?

- **Table:** `payments` (customer payments against invoices).
- **Filters:** same tenant, `paid_at >= from`, `paid_at <= to`.

So the period is “when did we **receive** the money?”

### 4.2 Cash received

- **Value:** `cashIn = sum(payments.amount)` for those payments.

This is the **actual money in** (including tax), for information.

### 4.3 Revenue (excl. tax) for profit

- **Invoices that “count”:** Those that have **at least one payment** in the period (from the step above).
- **Value:** `revenue = sum(invoices.subtotal)` over those invoices.

So for **cash** P&L we still measure “revenue” as **sales value before tax**, but we only include invoices that were **paid** in the period. That keeps profit comparable to accrual (revenue − COGS, no tax in revenue).

### 4.4 Cost (COGS)

- **Source:** `invoice_items` for the **same** set of invoices (invoices that received payment in the period).
- **Value:** `totalCost = sum(invoice_items.cost_amount)`.

So we match **cost to the sales that were paid** in the period: “Cost of the goods we got paid for in this period.”

### 4.5 Cash paid to suppliers

- **Table:** `purchase_payments`
- **Filters:** same tenant, `paid_at` in `[from, to]`.
- **Value:** `cashOut = sum(purchase_payments.amount)`.

Used for **net cash flow**, not for gross profit.

### 4.6 Gross profit and profit %

- **Gross profit** = `revenue − totalCost` (revenue and cost as above, both excl. tax in concept).
- **Profit %** = `(grossProfit / revenue) × 100` when `revenue > 0`, else 0.

So:

- **Cash “revenue” for profit** = sum of **subtotals** of invoices **paid** in the period (still excluding tax).
- **Cash cost** = COGS of those same invoices.
- **Cash profit** = that revenue − that cost.

---

## 5. Why It’s Done This Way (Summary)

| Decision | Reason |
|----------|--------|
| **Revenue = subtotal (excl. tax)** | Tax is not income; profit should be on “sales value” only. |
| **COGS from `invoice_items.cost_amount`** | Cost is captured at sale time from `last_purchase_price`, so profit is consistent and auditable. |
| **Accrual: by invoice date** | Matches standard accounting: recognise revenue when you invoice, not when you collect. |
| **Cash: by payment date** | Answers “what cash came in/out in this period?” and “profit on what we got paid for”. |
| **Only sent/paid invoices** | Drafts are not yet “sales”; they don’t affect P&L. |
| **Total purchases separate from COGS** | Purchases in the period ≠ cost of sales; COGS is the cost of what you *sold* (from invoice lines). |

---

## 6. Data Flow Diagram (Accrual)

```
Period [from, to]
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│ invoices (tenant, status in sent/paid, invoice_date in range) │
└──────────────────────────────────────────────────────────────┘
       │
       ├──► totalSales     = sum(invoices.subtotal)   [excl. tax]
       ├──► totalSalesInclTax = sum(invoices.total)   [for display]
       │
       └──► invoice_ids
                  │
                  ▼
            ┌─────────────────────────────────────────┐
            │ invoice_items (invoice_id in list)       │
            └─────────────────────────────────────────┘
                  │
                  └──► totalCost = sum(invoice_items.cost_amount)
                        [cost_price came from product.last_purchase_price at sale time]

grossProfit = totalSales − totalCost
profitPercent = grossProfit / totalSales × 100
```

---

## 7. Data Flow Diagram (Cash)

```
Period [from, to]
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│ payments (tenant, paid_at in range)                         │
└─────────────────────────────────────────────────────────────┘
       │
       ├──► cashIn = sum(payments.amount)   [actual money in, incl. tax]
       └──► invoice_ids = distinct invoice_id from those payments
                  │
                  ▼
            ┌─────────────────────────────────────────┐
            │ invoices (id in invoice_ids)             │
            │   → revenue = sum(invoices.subtotal)     │
            │ invoice_items (invoice_id in list)       │
            │   → totalCost = sum(cost_amount)         │
            └─────────────────────────────────────────┘

grossProfit = revenue − totalCost
profitPercent = grossProfit / revenue × 100
```

---

## 8. Where cost_price / cost_amount come from (reference)

- When an **invoice** is created or updated (create/send or edit/send):
  - For each line with a product: `cost_price = product.last_purchase_price` (or 0 if null).
  - `cost_amount = quantity × cost_price`.
- `product.last_purchase_price` is updated when a **purchase bill** is **recorded** (and that product is on the bill).

So: **P&L cost is always “cost at the time of sale”**, not “cost when we bought”. That’s why the report can be run for any period and stay consistent.

# Billing App — User Guide

**Step-by-step functionality with examples**

---

## How to get this as PDF

1. **From the repo:** Open `docs/USER_GUIDE.md` in VS Code or any Markdown viewer, then use “Print” or “Export to PDF” if available.
2. **Pandoc (command line):**  
   `pandoc docs/USER_GUIDE.md -o USER_GUIDE.pdf`
3. **Online:** Paste the content into a Markdown-to-PDF converter (e.g. md2pdf, markdown-pdf).
4. **Browser:** Open the `.md` file in a browser via a Markdown extension or GitHub preview, then **Print → Save as PDF**.

---

# 1. Introduction

This app helps you manage **products**, **customers**, **suppliers**, **purchase bills**, and **invoices** in one place. It supports:

- **Inventory tracking:** by quantity, by serial/IMEI (e.g. phones), or by batch (e.g. expiry).
- **Purchase bills** from suppliers (with optional serial/batch entry and payments).
- **Invoices** to customers (with serial picker when selling serial-tracked products).
- **Reports:** sales, outstanding, tax, P&amp;L, and more.

All data is **tenant-scoped**: each business (tenant) sees only its own products, customers, and transactions.

---

# 2. Getting started

## 2.1 Log in

1. Open the app and go to **Login**.
2. Enter your **email** and **password**.
3. Click **Log in**. You are taken to the **Dashboard**.

**Example:** Email: `shop@example.com`, Password: (your password).

## 2.2 Sign up (new business)

1. Click **Sign up**.
2. Enter **email** and **password** (and confirm password if required).
3. Submit. You receive a verification link by email.
4. After verifying, open **Sign up complete**: enter your **business name** and finish onboarding.
5. You can then log in and use the app.

**Example:** Business name: “My Mobile Store”.

## 2.3 Navigation

After login, the top bar shows:

- **Products** — Add and manage products.
- **Customers** — Customer list.
- **Suppliers** — Supplier list.
- **Purchase bills** — List and create purchase bills.
- **Invoices** — List invoices.
- **New invoice** — Create an invoice.
- **Reports** — Sales, outstanding, tax, etc.
- **Settings** — Business profile, tax, invoice numbering, tracking type, columns.

---

# 3. Dashboard

**Path:** Home (/) after login.

## What you see

- **This month:** Revenue (paid invoices), Draft total, Sent (pending) total, **Outstanding** (balance due from customers).
- **Shortcuts:** Cards to **Products**, **Customers**, **Invoices**, and **New invoice**.

## Example

- Revenue (paid): ₹50,000  
- Draft: ₹5,000 (2 invoices)  
- Sent: ₹10,000 (1 invoice)  
- Outstanding: ₹10,000 → “View report” goes to Reports.

---

# 4. Products

**Path:** **Products** in the menu.

## 4.1 Default tracking type

At the top you see: **Default product type: [Quantity | Serial/IMEI | Batch].**

This comes from **Settings → Inventory tracking**. New products get this type. You can filter the table by **All**, **Quantity**, **Serial**, or **Batch**.

## 4.2 Add a product

1. Scroll to the **Add product** form (or use the type filter).
2. Enter **Name** (e.g. “Samsung A17 8/128 black”).
3. Enter **Price** (e.g. 20999).
4. If shown, fill **Unit** (e.g. pc), **Company/Brand**, **RAM/Storage**, **Color**, etc. (fields depend on Settings and tracking type).
5. Click **Add product**.

**Example (Serial type):** Name: “Oppo A5pro 8/128 feather blue”, Price: 18999, Company: OPPO, RAM/Storage: 8GB/128GB, Color: feather blue. No IMEI on the product row — IMEIs are added when you **record a purchase bill** with serials.

## 4.3 View product list

- Table columns: **Name**, **Price**, **Tracking** (quantity/serial/batch), **Stock**, **Unit**, and any extra columns from Settings.
- **Stock** shows as “X · unit” (e.g. “1 · pc”). For serial/batch, if stock &gt; 0 you see a **View** button.

## 4.4 View serials or batches (serial/batch products)

1. Find the product in the table.
2. If stock &gt; 0, click **View** next to the stock.
3. A modal lists **Serial numbers** (for serial) or **Batches** (for batch) for that product.

**Example:** Product “Oppo A5pro” with stock 1 → View → one serial/IMEI listed (e.g. 863651070765215).

## 4.5 Edit a product

1. In the table row, click **Edit**.
2. Change name, price, or other allowed fields. **Tracking type** is read-only (set in Settings) unless stock is 0.
3. Save.

## 4.6 Delete a product

- Click **Delete** on the row. Confirm. Use only if the product is not used in invoices or purchase bills (or you accept breaking those links).

---

# 5. Customers

**Path:** **Customers** in the menu.

## 5.1 Add a customer

1. Fill **Name** (required), **Email**, **Phone**, **Address**.
2. Click **Add customer**.

**Example:** Name: “Vikas”, Phone: 9876543210, Address: “123 Main St”.

## 5.2 List and edit

- Table shows all customers. Use **Edit** to change details. **Delete** removes the customer (only if not used on invoices, or you accept breaking links).

---

# 6. Suppliers

**Path:** **Suppliers** in the menu.

## 6.1 Add a supplier

1. Enter **Name** (e.g. “Yuga Traders”), **Email**, **Phone**, **Address** (all optional except name).
2. Click **Add supplier**.

## 6.2 Supplier ledger

- From the list, open a supplier and go to **Supplier ledger** (or use the link on a purchase bill). You see all purchase bills for that supplier and total purchases / paid / balance.

---

# 7. Purchase bills

Purchase bills record **what you bought** from a supplier. They can be **draft** (editable) or **recorded** (stock and last purchase price updated).

## 7.1 Create a purchase bill

1. Go to **Purchase bills** → **New purchase bill**.
2. Select **Supplier** (e.g. Yuga Traders).
3. **Bill number:** Leave blank for **auto** (e.g. PB-0001) or enter your own (e.g. BILL-001).
4. **Bill date:** Select the purchase date.
5. **Items:** Add rows: choose **Product**, **Qty**, **Purchase price**. Amount is computed. For serial/batch products you will enter serials or batch when you **Record**.
6. Click **Create purchase bill**.

**Example:** Supplier: Yuga Traders, Bill number: (blank for auto), Date: 2026-02-09. Items: Oppo A5pro × 1 @ ₹18999, Samsung A07 × 1 @ ₹8999. Total ₹27998.

## 7.2 View and edit a draft

1. Open the bill from **Purchase bills** (e.g. click **View**).
2. If status is **draft**, you can change bill number, date, or line items.
3. Save changes.

## 7.3 Record a purchase bill (update stock)

Recording applies stock increases and updates **last purchase price**. For **serial** products you must enter serial numbers; for **batch** you enter batch number and optionally expiry.

1. Open the **draft** purchase bill.
2. Click **Record bill (update stock)**.
3. In the modal, if there are **serial** lines, enter one serial/IMEI per unit (e.g. one IMEI per row for qty 1). For **batch** lines, enter batch number and expiry if needed.
4. Confirm **Record bill**.

**Example:** One line “Oppo A5pro” qty 1 → enter IMEI “863651070765215” in the serials section, then Record. Stock for that product becomes 1 and the serial appears under Products → View.

## 7.4 Record a payment

1. Open the **recorded** bill.
2. Use **Record payment** (or the payments section).
3. Enter **Amount**, **Method** (cash/UPI/bank transfer), **Reference**, **Date**.
4. Submit. The bill’s **Amount paid** and **Balance** update.

**Example:** Amount: 27998, Method: cash, Date: 2026-02-09.

## 7.5 Print / Download PDF (purchase bill)

1. Open the bill → **Print / Download PDF**.
2. The print view shows: **Bill number**, **Date**, **Supplier**, table with **Product**, **Type**, **Serial/IMEI** (if any), **Batch** (if any), **Qty**, **Unit price**, **Amount**, **Total**, and payments.
3. Use **Print** or **Download PDF**.

---

# 8. Invoices

Invoices are what you send to **customers**. They can be **draft**, **sent**, or **paid**.

## 8.1 Create a new invoice

1. Go to **New invoice** (or **Invoices** → **New invoice**).
2. Select **Customer**, **Date**, **GST type** (Intra-state or Inter-state).
3. **Items:** Add lines — choose **Product** (or type to search if typeahead is on), **Description**, **Qty**, **Unit price**. For **serial** products you’ll see a **Serial (IMEI)** dropdown: pick which serial to sell for that line.
4. **Save as Draft** or **Save & Send**.
   - **Save as Draft:** Saves for later; no stock change.
   - **Save & Send:** Saves and marks as sent; **stock is deducted** (and for serial, the chosen serial is marked sold).

**Example:** Customer: Vikas, Date: 2026-02-09, GST: Intra-state. Line 1: Product “Oppo A5pro”, Qty 1, Unit price 18999, Serial (IMEI): select “863651070765215”. Line 2: Product “Samsung A07”, Qty 1, 8999. Total + tax. Click **Save & Send**.

## 8.2 Edit an invoice (draft or sent)

1. From **Invoices**, open the invoice → **Edit** (or open from print page).
2. Change customer, date, lines, or (for serial) which serial to sell.
3. **Save as Draft** or **Save & Send** as needed.

## 8.3 Send a draft invoice

- Open the draft → **Edit** → **Save & Send**. Or use the invoice list/print page if there is a “Send” action. Sending deducts stock and (for serial) marks the selected serials as sold.

## 8.4 Record a payment (customer paid you)

1. Open the invoice (e.g. from list or **Invoices** → open → **Print** view).
2. On the print page, use **Record payment**.
3. Enter **Amount**, **Method**, **Reference**, **Date**.
4. Submit. When total paid ≥ invoice total, status can become **Paid**.

**Example:** Invoice total ₹26,000. Record payment ₹26,000, method UPI. Balance becomes 0, status Paid.

## 8.5 Print / Download PDF (invoice)

1. Open the invoice → go to **Print** (or invoice detail → Print / view).
2. The print view shows: your **business name**, **logo**, **Invoice number**, **Date**, **Bill to** (customer), table with **#**, **Description**, **Type** (quantity/serial/batch), **Serial/IMEI** (if any serials were sold), **Qty**, **Unit price**, **Amount**, **Totals**, and **Payments**.
3. Use **Print** or **Download PDF**.

**Example (serial):** One line “Oppo A5pro” with serial 863651070765215 → printed invoice shows that serial in the Serial/IMEI column.

---

# 9. Reports

**Path:** **Reports** in the menu.

## 9.1 What’s available

- **Sales summary** (for selected period): revenue, invoice count.
- **Invoice summary:** Totals and counts for Draft, Sent, Paid.
- **Outstanding:** Invoices with balance due; total due.
- **Top products:** By sales in the period.
- **Top customers:** By sales in the period.
- **Tax summary:** CGST/SGST/IGST for the period (if applicable).
- **Revenue trend:** Last 6 months paid revenue.
- **Product profit:** Revenue vs cost by product for the period.

## 9.2 Use a report

1. Open **Reports**.
2. Choose **period**: This month, Last month, Last 7 days, or **All time**. Or set **From** and **To** dates.
3. Scroll to the section you need (e.g. Outstanding, Top products, Tax summary).
4. Use **View report** or links (e.g. to invoices) where shown.

**Example:** Period “This month” → Outstanding shows ₹10,000 from 1 invoice → click to see which invoice.

## 9.3 P&amp;L (Profit &amp; Loss)

**Path:** **Reports** → **P&amp;L** (or **reports/pnl**).

- Select **From** and **To**.
- View **Revenue**, **Cost of goods sold**, **Gross profit**, and other P&amp;L lines if configured.

---

# 10. Settings

**Path:** **Settings** in the menu.

## 10.1 Business profile

- **Business name**, **Currency**, **Currency symbol** (e.g. ₹).
- **GSTIN** (optional).
- **Logo:** Upload or remove. Used on invoices and purchase bill print.

## 10.2 Tax and invoice

- **Default tax %:** Applied to invoices (e.g. 18).
- **Invoice prefix** and **Next number** (e.g. INV-, 1 → INV-0001).
- **Invoice header/footer note:** Text on printed invoices.
- **Invoice page size:** A4 or Letter.

## 10.3 Purchase bill numbering

- **Purchase bill prefix** and **Next number** (e.g. PB-, 1). New bills can use auto-number (leave bill number blank when creating).

## 10.4 Inventory tracking (default product type)

- **Default tracking type:** **Quantity**, **Serial/IMEI**, or **Batch**.
- New products get this type. Product form and invoice line columns adapt (e.g. serial shows Serial/IMEI picker on invoice).

## 10.5 Product form columns

- Toggles to show/hide fields on the **product** form and table: Unit, HSN/SAC, Tax %, Company, RAM/Storage, Color, etc. (list depends on your schema).

## 10.6 Invoice line columns

- Toggles to show/hide extra columns on **invoice** line items (e.g. Company, RAM/Storage, Color). Which columns appear can also depend on **default tracking type** (e.g. serial shows company, ram_storage, color).

## 10.7 Invoice product search

- **Dropdown:** Full product list in a dropdown when adding a line.
- **Typeahead:** Search by typing; results load as you type.

Save all changes with **Save settings**.

---

# 11. Quick reference

| Task | Where | Action |
|------|--------|--------|
| Add product | Products | Form at top/bottom → Name, Price, optional fields → Add product |
| Add customer | Customers | Form → Name, etc. → Add customer |
| Add supplier | Suppliers | Form → Name, etc. → Add supplier |
| Create purchase bill | Purchase bills → New | Supplier, date, items → Create; then Record to update stock (enter serials if serial type) |
| Record payment (supplier) | Open purchase bill | Record payment → Amount, method, date |
| Create invoice | New invoice | Customer, date, items (pick serial for serial products) → Save as Draft or Save & Send |
| Record payment (customer) | Open invoice → Print | Record payment → Amount, method, date |
| Print invoice | Open invoice | Print / Download PDF |
| Print purchase bill | Open purchase bill | Print / Download PDF |
| Change default tracking type | Settings | Inventory tracking → Quantity / Serial/IMEI / Batch → Save |

---

# 12. Serial and batch at a glance

- **Quantity:** Stock is a number. No serial or batch entry.
- **Serial/IMEI:** Each unit has a serial (e.g. IMEI). On **purchase**: record bill and enter one serial per unit. On **invoice**: pick which serial to sell; printed invoice shows that serial. Stock = count of available serials.
- **Batch:** Stock is in batches (batch number, expiry, qty). On purchase you enter batch/expiry; on sale the app deducts using FEFO. Purchase and invoice print can show batch details.

---

*End of user guide. For PDF, export this file as described at the top.*

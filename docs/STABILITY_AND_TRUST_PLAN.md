# Stability, Trust & Daily Usability — Implementation Plan

**Goal:** Make the app “boring reliable” before adding power features.  
**Focus:** Stability, trust, daily usability.  
**Approach:** One area at a time; each step is shippable.

---

## Overview

| Phase | Area | Summary |
|-------|------|--------|
| **1** | UX & Reliability | Autosave drafts, confirm dialogs, empty states, loading skeletons, global error handling |
| **2** | Invoice Numbering Control | Prefix, starting number, per-tenant strategy in Settings |
| **3** | PDF & Print Improvements | Branded layout, logo, header/footer, download PDF, page size |
| **4** | Data Safety | Soft delete (products, customers), restore, read-only paid invoices |

---

## Phase 1: UX & Reliability

**Order of implementation (one by one):**

### 1.1 Confirm dialogs for delete & status changes
- **Why first:** Prevents accidental data loss; quick win.
- **Scope:**
  - **Delete:** Already have `window.confirm` for draft invoice delete, product delete, customer delete. Replace with a small **modal** (same style as edit modals) with “Cancel” and “Delete” (danger), and clear message: “Delete [product name]? This cannot be undone.” / “Delete draft invoice INV-0001?” / etc.
  - **Status changes:** On Invoice Print view, when user clicks “Mark as Sent” or “Mark as Paid”, show confirm modal: “Mark invoice INV-0001 as Sent?” / “Mark as Paid?” with Cancel / Confirm.
- **Tasks:**
  - Add a reusable `ConfirmDialog` component (title, message, confirmLabel, danger?, onConfirm, onCancel).
  - Use it in: Products (delete), Customers (delete), Invoices list (delete draft), InvoicePrint (delete draft, Mark as Sent, Mark as Paid).
- **Done when:** Every destructive or status-change action goes through the modal; no raw `window.confirm`.

---

### 1.2 Empty-state screens (no products / customers yet)
- **Why:** Clear guidance when lists are empty; reduces confusion.
- **Scope:**
  - **Products page:** When list is empty (and not loading), show a dedicated empty state: illustration or icon + “No products yet” + “Add your first product to use in invoices” + primary button “Add product” (scroll to or focus add form, or open a simple “Add first product” CTA).
  - **Customers page:** Same pattern: “No customers yet” + “Add customers to bill on invoices” + “Add customer”.
  - **Invoices page:** Already has “No invoices yet. Create one.” — optionally make it a card with a clearer CTA button to “Create first invoice”.
- **Tasks:**
  - Create a small `EmptyState` component (optional icon/illustration, title, description, actionLabel, onAction).
  - Use it on Products and Customers when `list.length === 0 && !loading`. Optionally refine Invoices empty state.
- **Done when:** Empty lists show a clear, actionable empty state instead of a single line of text.

---

### 1.3 Better loading skeletons (lists, invoice form)
- **Why:** Perceived performance and stability; no layout jump when data loads.
- **Scope:**
  - **Lists:** Products list, Customers list, Invoices list — while `loading`, show skeleton rows (e.g. 5–8 placeholder rows with shimmer animation) instead of only “Loading…”.
  - **Invoice form:** Create Invoice and Edit Invoice — while loading customers/products or submitting, show skeleton for the form area or a lightweight overlay so the form doesn’t “jump” when dropdowns populate.
- **Tasks:**
  - Add `Skeleton` or `ListSkeleton` component (e.g. gray blocks, optional shimmer CSS).
  - Products/Customers/Invoices: when loading, render skeleton table/cards instead of “Loading…”.
  - Create/Edit invoice: optional skeleton for select fields until options load; keep “Creating…” / “Saving…” on submit.
- **Done when:** All main lists and the invoice form have skeleton (or consistent loading) states.

---

### 1.4 Global error handling (expired session → auto logout)
- **Why:** User gets a clear path when token expires; no silent failures.
- **Scope:**
  - **API client:** On 401 response from any `/api/*` call, clear session (Supabase signOut) and redirect to `/login` (or set “session expired” and redirect). Optionally show a one-time toast: “Session expired. Please sign in again.”
  - **AuthContext:** Expose or use a single place for “invalid session” so the API client can trigger logout + redirect.
  - **Edge cases:** Don’t logout on 401 from signup/login endpoints if you have any; only for authenticated routes.
- **Tasks:**
  - In `api/client.js` (or wrapper): after `!res.ok`, if `res.status === 401`, call a callback or dispatch “session_expired” (e.g. via a small auth helper or context method), then redirect to `/login`.
  - In AuthContext: add `handleSessionExpired()` that signs out and sets a flag or triggers redirect; provide it to the app (e.g. via context or a module the API client can import).
  - Ensure ProtectedRoute and normal flows don’t double-redirect; show toast once.
- **Done when:** Any 401 from tenant-scoped API results in sign-out and redirect to login, with optional “Session expired” message.

---

### 1.5 Autosave draft invoices
- **Why:** Prevents loss of work; builds trust for daily use.
- **Scope:**
  - **Create flow:** On “New invoice” page, as user fills customer, date, and line items, periodically save to backend as draft (e.g. debounced 2–3 seconds after last change). If no invoice exists yet, POST to create draft then keep updating that draft with PATCH. Show a small “Saved” / “Saving…” indicator.
  - **Edit flow:** Same on Edit Invoice: debounced PATCH with current form state.
  - **Conflict:** If another tab or device edits, last-write-wins is acceptable for MVP; optional “Last saved at HH:mm” to set expectations.
- **Tasks:**
  - Backend: Ensure `POST /api/invoices` (draft) and `PATCH /api/invoices/:id` (full body) support partial updates if needed; they already support full draft body.
  - Frontend Create: After first successful POST (create draft), store `invoiceId` in state; on debounced change, PATCH that id with current items/customer/date. Debounce 2–3 s.
  - Frontend Edit: Already have invoice id; debounce PATCH on form change.
  - UI: “Saving…” while request in flight, “Saved at HH:mm” on success; optional “Unsaved changes” on navigation attempt (before autosave fires).
- **Done when:** Creating or editing a draft invoice auto-saves in the background; user sees save status and doesn’t lose work on refresh or accidental navigation.

---

**Phase 1 checklist:** Confirm dialogs → Empty states → Loading skeletons → Global 401 handling → Autosave drafts.

---

## Phase 2: Invoice Numbering Control

**Order of implementation:**

### 2.1 Database: tenant invoice settings
- **Scope:** Add to `tenants` (or a small `tenant_settings` table if you prefer):
  - `invoice_prefix` (text, e.g. `"INV-"`, `"2025-INV-"`) — default `"INV-"`.
  - `invoice_next_number` (integer) — next number to use (e.g. 1, 42). Enables “starting number” and avoids scanning max of `invoice_number` each time.
- **Tasks:**
  - Migration: `ALTER TABLE tenants ADD COLUMN invoice_prefix TEXT NOT NULL DEFAULT 'INV-', ADD COLUMN invoice_next_number INT NOT NULL DEFAULT 1;`
  - Backfill: For existing tenants, set `invoice_next_number` from current max per tenant (e.g. from existing `invoices.invoice_number`).
- **Done when:** Tenants have prefix and next_number; no write to invoices yet.

---

### 2.2 Backend: use prefix + next number when creating invoice
- **Scope:** When generating `invoice_number` for a new invoice:
  - Read tenant’s `invoice_prefix` and `invoice_next_number`.
  - Format: `prefix + pad(next_number)` (e.g. `INV-0001`, `2025-INV-0042`).
  - After insert, increment tenant’s `invoice_next_number` (in same transaction or immediately after).
- **Tasks:**
  - In `POST /api/invoices` (Vercel + Express): replace “compute next from max invoice_number” with: select tenant’s `invoice_prefix`, `invoice_next_number`; format number; insert invoice; update tenant set `invoice_next_number = invoice_next_number + 1`.
  - Handle race: use a short transaction or `SELECT ... FOR UPDATE` on tenant row so two concurrent creates don’t get the same number (or accept small risk for MVP and add lock later).
- **Done when:** New invoices get number from tenant settings; next number increments.

---

### 2.3 Settings UI: invoice prefix & starting number
- **Scope:**
  - **Settings page:** New section “Invoice numbering” with:
    - **Prefix:** text input (e.g. `INV-`, `2025-INV-`), max length ~20.
    - **Next number:** number input (read-only or editable). If editable, “Starting number” semantics: “Next invoice will use this number.” On save, set `invoice_next_number` to this value (backend must allow updating it).
  - **Validation:** Prefix required; next number >= 1. Backend: PATCH /api/me (or PATCH tenant) to update these fields.
- **Tasks:**
  - Backend: Extend GET/PATCH `/api/me` (tenant) to return and accept `invoice_prefix`, `invoice_next_number`. On PATCH, validate and update tenant.
  - Frontend Settings: Add fields; save with PATCH; show “Next invoice number will be: {prefix}{next_number}”.
- **Done when:** User can set invoice prefix and next/starting number from Settings; new invoices use them.

---

**Phase 2 checklist:** Migration (prefix + next_number) → Backend create uses them → Settings UI.

---

## Phase 3: PDF & Print Improvements

**Order of implementation:**

### 3.1 Branded invoice layout (header/footer notes)
- **Scope:** Tenant-level “header note” and “footer note” (plain text or simple HTML) shown on print/PDF.
- **Tasks:**
  - Migration: `tenants` add `invoice_header_note` (text), `invoice_footer_note` (text).
  - Backend: GET /api/me (tenant) return these; PATCH accept them. Optional: sanitize or allow only plain text for MVP.
  - Frontend InvoicePrint: Above “Bill to”, render header note if present; below “Thank you”, render footer note.
- **Done when:** Header and footer notes appear on print view and PDF.

---

### 3.2 Logo upload
- **Scope:** Tenant can upload a logo; it appears on the printed invoice (e.g. top-left next to shop name).
- **Tasks:**
  - Storage: Use Supabase Storage bucket (e.g. `tenant-assets`). Path: `{tenant_id}/logo.{ext}`. RLS: only that tenant can read/write their path.
  - Backend: `POST /api/me/logo` or `PUT /api/tenant/logo`: accept multipart file, validate type/size (e.g. image/*, max 2MB), upload to Supabase Storage, store URL or path in tenant (e.g. `tenants.logo_url`). GET /api/me returns `logo_url` (signed URL or public URL).
  - Frontend Settings: “Logo” with file input; on save upload then refetch tenant. Show current logo and “Remove logo” if present.
  - Frontend InvoicePrint: If `tenant.logo_url`, show `<img>` in header.
- **Done when:** User can set/remove logo in Settings; it appears on invoice print.

---

### 3.3 Page size selection (A4 / Letter)
- **Scope:** Tenant or per-print choice of page size for PDF.
- **Tasks:**
  - Option A (simple): Tenant setting `invoice_page_size` (‘A4’ | ‘Letter’). Migration + GET/PATCH tenant; print CSS uses `@page { size: A4 }` or `size: Letter` from tenant.
  - Option B: Per-print dropdown “Page size: A4 / Letter” on the print view; store in local state and apply to `@page` only for that session.
  - Implement Option A first: Settings → “Invoice page size” dropdown; InvoicePrint reads tenant and sets a class or inline style for `@page size`.
- **Done when:** User can choose A4 or Letter; print/PDF use that size.

---

### 3.4 Download PDF (not just browser print)
- **Scope:** A “Download PDF” button that produces a PDF without requiring the user to use the browser’s Print dialog.
- **Options:**
  - **Client-side (recommended for MVP):** Use a library like `html2pdf.js` or `jspdf` + `html2canvas` to render the invoice node to PDF in the browser and trigger download. No server changes; works with current layout and logo/header/footer.
  - **Server-side:** Backend endpoint that renders HTML to PDF (e.g. Puppeteer, wkhtmltopdf) and returns the file. More control, more infra.
- **Tasks (client-side):**
  - Add dependency (e.g. `html2pdf.js`).
  - On InvoicePrint, “Download PDF” button: select the invoice container DOM node, call library to generate PDF (with page size from tenant), then trigger download (e.g. `invoice-INV-0001.pdf`).
  - Ensure logo and header/footer are included in the captured region.
- **Done when:** “Download PDF” button on print view produces a file; page size and branding respected.

---

**Phase 3 checklist:** Header/footer notes → Logo upload → Page size → Download PDF.

---

## Phase 4: Data Safety

**Order of implementation:**

### 4.1 Soft delete for products
- **Scope:** Products are never hard-deleted; they are marked deleted and hidden from normal flows.
- **Tasks:**
  - Migration: `products` add `deleted_at` (timestamptz, nullable). Index `(tenant_id, deleted_at)` for “list non-deleted” queries.
  - Backend: All product reads (list, get by id, dropdown in invoice) filter `deleted_at IS NULL`. “Delete” product → UPDATE `deleted_at = now()` instead of DELETE. Optional: prevent “delete” if product is used in an invoice (keep current behavior or allow soft delete and show “Deleted” in history).
  - Frontend: No change to list behavior (deleted excluded). Delete action still “Delete” but backend does soft delete.
- **Done when:** Deleting a product sets `deleted_at`; lists and invoice product dropdown only show non-deleted.

---

### 4.2 Soft delete for customers
- **Scope:** Same pattern as products.
- **Tasks:**
  - Migration: `customers` add `deleted_at` (timestamptz, nullable). Index `(tenant_id, deleted_at)`.
  - Backend: All customer reads filter `deleted_at IS NULL`. Delete customer → UPDATE `deleted_at = now()`. Invoices already reference customer_id; existing invoices keep pointing to that customer (read-only for paid).
  - Frontend: Same as today; delete triggers soft delete on backend.
- **Done when:** Deleting a customer sets `deleted_at`; lists and invoice customer dropdown only show non-deleted.

---

### 4.3 Restore recently deleted records
- **Scope:** Allow restoring products and customers that were soft-deleted “recently” (e.g. last 30 days or last N records).
- **Tasks:**
  - Backend: `GET /api/products?deleted=1` (or `include_deleted=1`) returns only deleted products for tenant, ordered by `deleted_at DESC`. Same for customers. `PATCH /api/products/:id/restore` (and customers) sets `deleted_at = null`. Restrict to same tenant.
  - Frontend: “Deleted” or “Restore” section on Products page (e.g. collapsible “Recently deleted products”) listing deleted items with “Restore” button. Same for Customers. Optional: only show if there are deleted items.
- **Done when:** User can see recently deleted products/customers and restore them; restored items reappear in lists and dropdowns.

---

### 4.4 Read-only mode for paid invoices
- **Scope:** Paid invoices cannot be edited (no edit link, no status change, no delete).
- **Tasks:**
  - Backend: Already enforce “only draft can be edited/deleted” and status transitions. No change needed if you don’t allow editing paid.
  - Frontend Invoices list: For paid (and optionally sent) invoices, hide “Edit” and “Delete”; only “View / Print”.
  - Frontend InvoicePrint: For paid invoices, hide “Edit”, “Delete draft”, “Mark as Sent”, “Mark as Paid”. Show only “View / Print” and “Download PDF”. Optional: show a banner “This invoice is paid and cannot be modified.”
- **Done when:** Paid invoices are clearly read-only everywhere (list + print view); no edit/delete/status actions.

---

**Phase 4 checklist:** Soft delete products → Soft delete customers → Restore UI → Read-only paid invoices.

---

## Suggested overall order (one by one)

1. **1.1** Confirm dialogs  
2. **1.2** Empty states  
3. **1.3** Loading skeletons  
4. **1.4** Global 401 / session expired  
5. **1.5** Autosave draft invoices  
6. **2.1** DB invoice prefix + next number  
7. **2.2** Backend use prefix + next number  
8. **2.3** Settings invoice numbering UI  
9. **3.1** Header/footer notes  
10. **3.2** Logo upload  
11. **3.3** Page size (A4/Letter)  
12. **3.4** Download PDF  
13. **4.1** Soft delete products  
14. **4.2** Soft delete customers  
15. **4.3** Restore deleted  
16. **4.4** Read-only paid invoices  

Each step is independently testable and shippable. Start with **1.1** and proceed in order unless you need to reorder for a release (e.g. do 4.4 early if you want to lock paid invoices sooner).

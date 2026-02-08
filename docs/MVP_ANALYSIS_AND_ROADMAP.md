# Billing MVP — Complete Functionality Analysis & Suggested Changes

This document analyzes the current app end-to-end and recommends **prioritized changes** to make the MVP more complete and production-ready, without overbuilding.

---

## 1. Current Functionality Summary

### 1.1 Authentication & onboarding
| Feature | Status | Notes |
|--------|--------|--------|
| Sign up (email + password) | ✅ | Via Supabase Auth |
| Log in / Log out | ✅ | Session + JWT |
| Create shop (tenant) | ✅ | One-time after signup; name + slug |
| Protected routes | ✅ | Redirect to login or signup/complete |
| Session persistence | ✅ | Supabase + /api/me for user/tenant |

**Gaps:** No password reset, no “forgot password”, no way to change shop name after creation, no profile/settings page.

---

### 1.2 Products
| Feature | Status | Notes |
|--------|--------|--------|
| List products | ✅ | With search (name) |
| Add product | ✅ | Name, price, unit |
| Edit product | ❌ | Not implemented |
| Delete product | ❌ | Not implemented |
| Duplicate name | ⚠️ | Allowed; no uniqueness check |

**Gaps:** Cannot fix a typo in price/name or remove obsolete products. No pagination (fine for small lists).

---

### 1.3 Customers
| Feature | Status | Notes |
|--------|--------|--------|
| List customers | ✅ | With search (name, email) |
| Add customer | ✅ | Name, email, phone, address |
| Edit customer | ❌ | Not implemented |
| Delete customer | ❌ | Not implemented (DB has RESTRICT on invoices) |

**Gaps:** Cannot correct customer details. Deleting a customer is blocked if they have invoices (by design); no “merge” or “archive” option.

---

### 1.4 Invoices
| Feature | Status | Notes |
|--------|--------|--------|
| List invoices | ✅ | By tenant; number, date, status, total |
| Create invoice | ✅ | Customer, date, line items (product picker + description, qty, price) |
| View / print invoice | ✅ | Print-friendly view; browser Print → PDF |
| Edit invoice | ❌ | Not implemented (draft only at create) |
| Delete / void invoice | ❌ | Not implemented |
| Change status (draft → sent → paid) | ❌ | Status stored but no UI to update |
| Filter by status or customer | ⚠️ | API supports `?status=` and `?customerId=`; frontend does not use |

**Gaps:** Once created, an invoice cannot be updated or marked sent/paid. No search/filter on invoice list.

---

### 1.5 Tenant / shop
| Feature | Status | Notes |
|--------|--------|--------|
| Create shop | ✅ | At signup complete |
| Edit shop name | ❌ | Not implemented |
| Shop branding on invoice | ✅ | Tenant name on print view |

**Gaps:** No settings page; shop name is fixed after creation.

---

### 1.6 UX & robustness
| Area | Status | Notes |
|------|--------|--------|
| Responsive layout | ✅ | Mobile / tablet / desktop |
| Error display | ✅ | Inline error messages on forms and list |
| Loading states | ✅ | Loading… on lists and print |
| Success feedback | ⚠️ | No toast/snackbar after create (e.g. “Product added”) |
| Empty states | ✅ | “No products yet”, “No invoices yet” with CTA |
| Offline / retry | ❌ | No retry on network failure |
| Validation | ✅ | API validates; frontend has required fields |

---

### 1.7 Backend (API)
| Area | Status | Notes |
|------|--------|--------|
| Auth & tenant resolution | ✅ | JWT → tenant_id from users table |
| Products GET/POST | ✅ | No PATCH/DELETE |
| Customers GET/POST | ✅ | No PATCH/DELETE |
| Invoices GET/POST, GET by id | ✅ | No PATCH/DELETE |
| Body parsing | ✅ | Safe parse in invoices; others use req.body |
| Error handling | ✅ | try/catch in invoices; others could use same pattern |
| CORS / deployment | ✅ | Vercel serverless + env |

---

## 2. Suggested Changes (Prioritized)

### Tier 1 — MVP completeness (do first)

These make the app usable day-to-day without workarounds.

#### 1. **Edit & delete product** (high impact)
- **Why:** Typos and discontinued products are common; list becomes messy without delete.
- **Backend:** Add `PATCH /api/products/:id` and `DELETE /api/products/:id` (tenant-scoped). For delete, either allow only if product not used in any invoice, or soft-delete / keep in DB but hide from list.
- **Frontend:** On Products page, add “Edit” and “Delete” per row (or icon buttons). Edit: inline form or small modal with name, price, unit; PATCH on save. Delete: confirm then DELETE; remove from list (and optionally show “Cannot delete: used in invoices” if API returns 409).

#### 2. **Edit customer** (high impact)
- **Why:** Phone/address/email change frequently; no way to fix without recreating.
- **Backend:** Add `PATCH /api/customers/:id` (tenant-scoped). No delete needed for MVP if you keep RESTRICT (customer with invoices cannot be deleted); optional later.
- **Frontend:** On Customers page, add “Edit” per row; form/modal with name, email, phone, address; PATCH on save.

#### 3. **Update invoice status (draft → sent → paid)** (high impact)
- **Why:** Status is stored but never changed; users need to mark invoices sent/paid.
- **Backend:** Add `PATCH /api/invoices/:id` with body `{ status: 'sent' | 'paid' }` (and optionally only allow draft→sent→paid). Validate status transition if you want (e.g. no going back to draft once sent).
- **Frontend:** On invoice print view (and optionally in list), add a dropdown or buttons “Mark as Sent” / “Mark as Paid”. Call PATCH then refresh or update local state. Show current status clearly.

#### 4. **Filter invoices by status** (medium impact)
- **Why:** API already supports `?status=`; listing “only unpaid” or “only drafts” is expected.
- **Frontend:** On Invoices page, add a status filter (e.g. All / Draft / Sent / Paid) and pass `?status=` to GET /api/invoices. Optional: filter by date range later.

#### 5. **Success feedback after create** (medium impact)
- **Why:** User doesn’t get clear confirmation that product/customer/invoice was added.
- **Frontend:** After successful POST (product, customer, invoice), show a short-lived toast/snackbar: “Product added”, “Customer added”, “Invoice created”. Reuse the toast styles you have in App.css (`.toast`, `.toast-container`); add a small context (e.g. React context or component state) to trigger toasts from pages.

---

### Tier 2 — Important for daily use

#### 6. **Edit shop name**
- **Backend:** Add `PATCH /api/tenants/me` or `PATCH /api/me` with `{ name }` (tenant name only; slug can stay). Resolve tenant from auth and update `tenants.name`.
- **Frontend:** Add a simple “Settings” or “Shop” page (link in layout): single field “Shop name” + Save. Optional: show current name and slug (read-only).

#### 7. **Edit draft invoice**
- **Why:** Users often need to fix a line or customer before marking sent.
- **Backend:** Add `PATCH /api/invoices/:id` with full body (customerId, invoiceDate, status, items). Only allow if current status is `draft`; validate items and recalc total; update `invoices` and replace `invoice_items` (delete existing items for that invoice, insert new set).
- **Frontend:** Add “Edit” on print view (or list) only when status is draft; navigate to an Edit Invoice page (reuse CreateInvoice form prefilled with invoice data). On save, PATCH and redirect to print view.

#### 8. **Delete draft invoice**
- **Backend:** Add `DELETE /api/invoices/:id`. Only allow if status is `draft` (optional: allow for any status and call it “void”).
- **Frontend:** “Delete” or “Void” button on list/print when draft; confirm dialog then DELETE and redirect to list.

#### 9. **Password reset (forgot password)**
- **Backend:** Not needed; Supabase Auth handles it.
- **Frontend:** On Login page, add “Forgot password?” link; open Supabase `resetPasswordForEmail(email)`; show “Check your email for reset link”. Improves support and reduces lockouts.

---

### Tier 3 — Nice to have (post-MVP)

- **Pagination** for products/customers/invoices when list grows (API already has limit/offset for invoices).
- **Currency setting** per tenant (currently ₹ is hardcoded); store in `tenants` and use in format.
- **GST/tax** (India): tax % and GSTIN on tenant; tax line on invoice; DESIGN.md defers this.
- **Export** invoices list to CSV.
- **Audit** (who created/updated what); DESIGN.md mentions this as technical debt.
- **Multiple users per tenant** and **subdomains**; DESIGN.md Phase 9.

---

## 3. What Not to Change Yet

- **Multi-tenant in JWT / multi-shop per user:** Keep one user = one shop.
- **Database per tenant / schema per tenant:** Stay single DB + tenant_id.
- **Roles (owner/staff):** Single owner per shop is enough for MVP.
- **Payment gateway:** Add only when you have a clear requirement; then webhook + status update.

---

## 4. Implementation Checklist (Tier 1)

Use this as a quick list when implementing Tier 1.

- [ ] **Products:** `PATCH /api/products/:id`, `DELETE /api/products/:id`; Products page Edit + Delete (with confirm for delete).
- [ ] **Customers:** `PATCH /api/customers/:id`; Customers page Edit.
- [ ] **Invoice status:** `PATCH /api/invoices/:id` body `{ status }`; Print view (and optionally list) “Mark as Sent” / “Mark as Paid”.
- [ ] **Invoice filter:** Invoices page status dropdown; GET `/api/invoices?status=...`.
- [ ] **Toasts:** Toast context + trigger “Product added” / “Customer added” / “Invoice created” after successful POST.

---

## 5. Summary

| Area | Current | Suggested next (MVP) |
|------|--------|----------------------|
| Auth | Login, signup, shop create | Forgot password; optional: edit shop name |
| Products | List, add | Edit, delete |
| Customers | List, add | Edit |
| Invoices | List, create, view/print | Update status; filter by status; edit/delete draft |
| Shop | Name at signup only | Settings: edit shop name |
| UX | Errors, loading, empty states | Success toasts; optional retry |

Implementing **Tier 1** (edit/delete product, edit customer, invoice status update, invoice filter, success toasts) will make the MVP feel complete for daily use. Then add Tier 2 (shop name, edit/delete draft invoice, forgot password) as needed.

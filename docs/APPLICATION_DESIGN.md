# Multi-Tenant Billing Application — Comprehensive Design Document

**Version:** Post–Tier 3 (MVP + Pagination, Currency/GST/Tax, CSV Export)  
**Stack:** React (Vite), Supabase (Auth + PostgreSQL), Vercel (frontend + serverless API), optional Express (local dev)  
**Audience:** Small shop owners; one login = one shop; full tenant data isolation.

---

## 1. Overview

### 1.1 Purpose

A multi-tenant web app that lets each shop owner:

- **Authenticate** via email/password (Supabase Auth) and complete onboarding with a shop name.
- **Manage products** (name, price, unit) with search and pagination.
- **Manage customers** (name, email, phone, address) with search and pagination.
- **Create and manage invoices** (draft → sent → paid): line items, optional product link, subtotal/tax/total, print view, export to CSV.
- **Configure shop** (name, currency, currency symbol, GSTIN, tax %) in Settings.

All data is scoped by tenant (shop). The backend **never** trusts `tenant_id` from the client; it is always resolved from the authenticated user.

### 1.2 Deployment Modes

| Mode | Frontend | Backend API | Use case |
|------|----------|-------------|----------|
| **Production (Vercel)** | Vercel (SPA) | Vercel serverless `api/*` | Live app |
| **Local development** | Vite dev server | Express in `server/` | Same behavior as production |

Frontend talks to one base URL (`VITE_API_URL`). All tenant-scoped requests use `Authorization: Bearer <Supabase JWT>`.

### 1.3 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  USER BROWSER                                                            │
│  - React SPA (Vite)                                                     │
│  - Supabase Auth (login, signup, forgot password, JWT)                  │
│  - All /api/* calls with JWT → backend                                   │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │ HTTPS, Authorization: Bearer <JWT>
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  BACKEND (Vercel serverless api/* or Express server)                      │
│  - Verify JWT → resolve auth_id → users.tenant_id → req.tenantId         │
│  - All DB queries filter by tenant_id                                    │
│  - Supabase client (service role) for PostgreSQL                         │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  SUPABASE                                                                │
│  - Auth: auth.users (identities), JWT issuance                           │
│  - PostgreSQL: tenants, users, products, customers, invoices,            │
│                invoice_items (all tenant-scoped)                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Database Schema

### 2.1 Tables Summary

| Table | Purpose |
|-------|---------|
| **tenants** | One row per shop: name, slug, currency, GST/tax settings. |
| **users** | Links Supabase Auth (`auth_id`) to one tenant; one user per tenant in MVP. |
| **products** | Tenant’s products: name, price, unit. |
| **customers** | Tenant’s customers: name, email, phone, address. |
| **invoices** | Invoice header: customer, number, date, status, subtotal, tax, total. |
| **invoice_items** | Line items: description, quantity, unit_price, amount; optional product_id. |

Supabase Auth owns `auth.users`; we do not define it. Our tables live in `public`.

### 2.2 Full Column Reference

**tenants** (from `00001_initial_schema.sql` + `00002_currency_gst_tax.sql`)

| Column | Type | Constraints / Notes |
|--------|------|----------------------|
| id | UUID | PK, default gen_random_uuid() |
| name | TEXT | NOT NULL |
| slug | TEXT | NOT NULL, UNIQUE |
| created_at | TIMESTAMPTZ | NOT NULL, default now() |
| currency | TEXT | NOT NULL, default 'INR' |
| currency_symbol | TEXT | nullable (e.g. ₹, $) |
| gstin | TEXT | nullable (India GSTIN) |
| tax_percent | NUMERIC(5,2) | NOT NULL, default 0, CHECK 0–100 |

**users**

| Column | Type | Constraints / Notes |
|--------|------|----------------------|
| id | UUID | PK |
| auth_id | UUID | NOT NULL, UNIQUE (Supabase Auth uid) |
| tenant_id | UUID | NOT NULL, FK → tenants(id) ON DELETE CASCADE |
| email | TEXT | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL |

**products**

| Column | Type | Constraints / Notes |
|--------|------|----------------------|
| id | UUID | PK |
| tenant_id | UUID | NOT NULL, FK → tenants ON DELETE CASCADE |
| name | TEXT | NOT NULL |
| price | NUMERIC(12,2) | NOT NULL, >= 0 |
| unit | TEXT | nullable |
| created_at | TIMESTAMPTZ | NOT NULL |

**customers**

| Column | Type | Constraints / Notes |
|--------|------|----------------------|
| id | UUID | PK |
| tenant_id | UUID | NOT NULL, FK → tenants ON DELETE CASCADE |
| name | TEXT | NOT NULL |
| email | TEXT | nullable |
| phone | TEXT | nullable |
| address | TEXT | nullable |
| created_at | TIMESTAMPTZ | NOT NULL |

**invoices**

| Column | Type | Constraints / Notes |
|--------|------|----------------------|
| id | UUID | PK |
| tenant_id | UUID | NOT NULL, FK → tenants ON DELETE CASCADE |
| customer_id | UUID | NOT NULL, FK → customers ON DELETE RESTRICT |
| invoice_number | TEXT | NOT NULL; UNIQUE(tenant_id, invoice_number) |
| invoice_date | DATE | NOT NULL |
| status | TEXT | NOT NULL, CHECK IN ('draft','sent','paid'), default 'draft' |
| subtotal | NUMERIC(12,2) | NOT NULL |
| tax_percent | NUMERIC(5,2) | NOT NULL, default 0 (snapshot from tenant) |
| tax_amount | NUMERIC(12,2) | NOT NULL, default 0 |
| total | NUMERIC(12,2) | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL, trigger-updated |

**invoice_items**

| Column | Type | Constraints / Notes |
|--------|------|----------------------|
| id | UUID | PK |
| invoice_id | UUID | NOT NULL, FK → invoices ON DELETE CASCADE |
| product_id | UUID | nullable, FK → products ON DELETE SET NULL |
| description | TEXT | NOT NULL |
| quantity | NUMERIC(12,2) | NOT NULL, > 0 |
| unit_price | NUMERIC(12,2) | NOT NULL, >= 0 |
| amount | NUMERIC(12,2) | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL |

### 2.3 Indexes

- **tenants:** idx_tenants_slug (slug)
- **users:** idx_users_auth_id (auth_id) UNIQUE, idx_users_tenant_id (tenant_id)
- **products:** idx_products_tenant_id, idx_products_tenant_name
- **customers:** idx_customers_tenant_id, idx_customers_tenant_name
- **invoices:** idx_invoices_tenant_id, idx_invoices_tenant_date, idx_invoices_customer_id; UNIQUE(tenant_id, invoice_number)
- **invoice_items:** idx_invoice_items_invoice_id

### 2.4 Tenant Isolation

- Every tenant-scoped table has `tenant_id`. All API reads/writes use `WHERE tenant_id = $1` with the value from **server-side** user lookup (JWT → users.tenant_id). Client never sends or selects `tenant_id`.

---

## 3. Authentication & Onboarding

### 3.1 Flows

1. **Sign up**
   - User enters email + password on `/signup`.
   - Frontend calls Supabase `signUp({ email, password })`. No tenant yet.
   - User is redirected to `/signup/complete`.

2. **Complete onboarding**
   - User enters shop name on “Create your shop”.
   - Frontend calls `POST /api/signup/complete` with JWT and body `{ shopName, email }`.
   - Backend: ensure no `users` row for this `auth_id`; create `tenants` row (name, slug); create `users` row (auth_id, tenant_id, email).
   - Frontend then fetches `/api/me` and stores tenant in AuthContext; user can access app.

3. **Login**
   - Email + password on `/login` → Supabase `signInWithPassword`.
   - If session exists but no tenant (e.g. old flow), redirect to `/signup/complete`.
   - Otherwise redirect to `/` (Dashboard).

4. **Forgot password**
   - On login page, “Forgot password?” → enter email → Supabase `resetPasswordForEmail(email, { redirectTo: origin/login })`. User gets email link to reset.

5. **Logout**
   - Supabase `signOut()`; AuthContext clears user/tenant; redirect to login when hitting protected routes.

### 3.2 JWT & Tenant Resolution

- **JWT:** Issued by Supabase Auth; contains `sub` (auth.uid). We do **not** put tenant_id in the JWT.
- **Backend:** On each request, verify JWT → get `auth_id` (sub) → `SELECT id, tenant_id FROM users WHERE auth_id = $1` → set `req.tenantId`, `req.userId`. If no user row → 403 “User not onboarded”.
- **Frontend:** Sends only `Authorization: Bearer <access_token>`. Tenant comes from `GET /api/me` and is kept in AuthContext (refetched after signup/complete and after PATCH /api/me).

### 3.3 Protected Routes

- **ProtectedRoute** (wrapper around Layout and all app routes):
  - Loading → show spinner.
  - No session → redirect to `/login`.
  - Session but no tenant → redirect to `/signup/complete`.
  - Otherwise render children (Dashboard, Products, Customers, Invoices, Settings, etc.).

---

## 4. API Reference

Base path: `/api`. All authenticated endpoints require `Authorization: Bearer <Supabase JWT>`. Responses are JSON unless noted (e.g. CSV).

### 4.1 Signup (onboarding)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/signup/complete | JWT (optionalAuth: no user row required) | Create tenant + user for first-time signup |

**Body:** `{ "shopName": "My Shop", "email": "user@example.com" }` (email optional if in JWT)

**Success:** 201 `{ tenant: { id, name, slug }, user: { id, email } }`  
**Errors:** 400 (already onboarded, missing/invalid shopName); 401 (invalid/missing JWT)

---

### 4.2 Current user & tenant (Me)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/me | Required | Return current user and tenant (including currency, gstin, tax_percent) |
| PATCH | /api/me | Required | Update tenant: name, currency, currency_symbol, gstin, tax_percent |

**GET response:**  
`{ user: { id, email }, tenant: { id, name, slug, currency, currency_symbol, gstin, tax_percent } }`

**PATCH body (all optional):**  
`{ name?, currency?, currency_symbol?, gstin?, tax_percent? }`  
- tax_percent: number 0–100.  
- Empty strings for optional fields stored as null.

**Response:** Same shape as GET (updated user + tenant).

---

### 4.3 Products

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/products | Required | List products; pagination and search |
| GET | /api/products/:id | Required | Single product |
| POST | /api/products | Required | Create product |
| PATCH | /api/products/:id | Required | Update product (name, price, unit) |
| DELETE | /api/products/:id | Required | Delete product (409 if used in invoices) |

**GET /api/products**  
Query: `q` (search name, ilike), `limit` (default 50, max 100), `offset` (default 0).  
Response: `{ data: Product[], total: number }`.

**POST body:** `{ name: string, price: number, unit?: string }`  
Response: 201, created product.

**PATCH body:** `{ name?, price?, unit? }`  
Response: 200, updated product.

---

### 4.4 Customers

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/customers | Required | List customers; pagination and search |
| GET | /api/customers/:id | Required | Single customer |
| POST | /api/customers | Required | Create customer |
| PATCH | /api/customers/:id | Required | Update customer |

**GET /api/customers**  
Query: `q` (search name/email), `limit`, `offset`.  
Response: `{ data: Customer[], total: number }`.

**POST body:** `{ name, email?, phone?, address? }`  
**PATCH body:** same fields, all optional.

---

### 4.5 Invoices

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/invoices | Required | List invoices (paginated); optional CSV export |
| GET | /api/invoices/:id | Required | Single invoice with items and customer |
| POST | /api/invoices | Required | Create draft invoice (tax from tenant) |
| PATCH | /api/invoices/:id | Required | Update: status only (sent/paid) or full draft body |
| DELETE | /api/invoices/:id | Required | Delete draft only |

**GET /api/invoices**  
Query: `status` (draft|sent|paid), `customerId`, `limit`, `offset`.  
If **query.format = csv**: response is `text/csv` with header and rows (invoice_number, date, status, subtotal, tax, total, created_at); no pagination.  
Otherwise response: `{ data: Invoice[], total: number }`.

**POST body:**  
`{ customerId, invoiceDate, status?: 'draft', items: [ { productId?, description, quantity, unitPrice } ] }`  
- Backend: next invoice_number per tenant; validate customer; resolve product name/price when productId given; compute subtotal; load tenant tax_percent → tax_amount, total; insert invoice + invoice_items.

**PATCH body (one of):**  
- **Status only:** `{ status: 'sent' | 'paid' }`. Allowed transitions: draft→sent, sent→paid.  
- **Full draft:** `{ customerId, invoiceDate, items: [ ... ] }`. Same validation as POST; replaces items; recomputes subtotal, tax, total from tenant tax_percent.

**DELETE:** Only if status is draft; 400 otherwise.

**GET /api/invoices/:id**  
Response: invoice object with `customer` (id, name, email, phone, address) and `invoice_items[]`.

---

## 5. Frontend

### 5.1 Tech Stack

- **React 18**, **Vite**, **React Router 6**
- **Supabase JS** (auth only; no direct DB from browser)
- **Context:** AuthContext (session, user, tenant, login, signUp, signupComplete, logout, token, refetchMe), ToastContext (showToast)

### 5.2 Routes

| Path | Component | Description |
|------|-----------|-------------|
| /login | Login | Email/password login; forgot password link |
| /signup | Signup | Email/password signup → redirect to /signup/complete |
| /signup/complete | SignupComplete | Shop name → POST /api/signup/complete |
| / | Layout + ProtectedRoute | Wrapper for all app routes |
| / | Dashboard | Links to Products, Customers, Invoices, New invoice |
| /products | Products | List (search, pagination), add, edit, delete products |
| /customers | Customers | List (search, pagination), add, edit customers |
| /invoices | Invoices | List (filter by status, pagination), Export CSV, links to new/edit/print |
| /invoices/new | CreateInvoice | Create draft invoice (customer, date, line items; subtotal/tax/total) |
| /invoices/:id/edit | EditInvoice | Edit draft only (same form as create) |
| /invoices/:id/print | InvoicePrint | Print view; Mark as Sent/Paid; Delete draft; Print/PDF |
| /settings | Settings | Shop name; currency code/symbol; GSTIN; tax % (PATCH /api/me) |
| * | Navigate to / | Fallback |

### 5.3 API Client (`src/api/client.js`)

- **BASE:** `VITE_API_URL` (no trailing slash).
- **api(token, path, options):** fetch with JSON and `Authorization: Bearer <token>`; parse JSON; on !res.ok throw Error with message from body.
- **get, post, put, patch, del:** convenience wrappers.
- **downloadCsv(token, path, filename):** GET request, read body as text, create Blob, trigger download (for invoices CSV export).

### 5.4 Formatting (`src/lib/format.js`)

- **formatMoney(amount, tenant):** Uses `tenant.currency_symbol` or a small map (INR→₹, USD→$, etc.); returns string like `₹123.45`. Used everywhere amounts are displayed (invoices, products, create/edit invoice, print view).

### 5.5 Page-Level Features

- **Dashboard:** Cards linking to Products, Customers, Invoices, New invoice.
- **Products:** Search (q), pagination (limit/offset, 20 per page); add form; table with edit/delete; modal for edit. Prices shown with formatMoney(tenant). List uses `res.data` and `res.total`.
- **Customers:** Same pattern: search, pagination (20), add/edit (modal). List uses `res.data` and `res.total`.
- **Invoices:** Status filter (All/Draft/Sent/Paid); pagination (20); Export CSV button (GET ?format=csv); cards + table; Edit/Delete (draft only), View/Print. Totals with formatMoney(tenant).
- **Create invoice:** Customer dropdown, date; line items (optional product, description, qty, unit price); subtotal, tax %, tax amount, total from tenant.tax_percent; POST then redirect to print view. Customers/products fetched with ?limit=500; use res.data.
- **Edit invoice:** Same form; load invoice; only draft; PATCH then redirect to print. Same tax/currency behavior.
- **Invoice print:** Shop name; GSTIN if set; Bill to; items table; subtotal/tax/total breakdown when tax > 0; Mark as Sent/Paid; Delete draft; Print/Save as PDF (browser print).
- **Settings:** Shop name, slug (read-only); currency code, currency symbol, GSTIN, tax %; Save → PATCH /api/me; null-safe for all fields (no .trim() on null).

### 5.6 List Response Handling

All list endpoints return `{ data: T[], total: number }`. Frontend uses `data` for the list and `total` for pagination. Backward compatibility: if response is an array, it is treated as `data` and `total` inferred.

---

## 6. Security

- **Tenant ID:** Always from server (JWT → users.tenant_id). Never from request body or query.
- **Auth:** 401 for missing/invalid JWT; 403 when JWT valid but no user row (not onboarded).
- **CORS:** Backend allows only configured frontend origin (production).
- **Env:** No secrets in frontend; Supabase anon key for Auth only; service role key only on backend.
- **Input:** Validation on all POST/PATCH (required fields, lengths, numeric ranges). Parameterized queries only.

---

## 7. Deployment & Environment

### 7.1 Environment Variables

**Frontend (Vite):**  
- `VITE_SUPABASE_URL` — Supabase project URL  
- `VITE_SUPABASE_ANON_KEY` — Supabase anon key (Auth)  
- `VITE_API_URL` — Backend base URL (e.g. https://your-api.vercel.app or http://localhost:3001)

**Backend (Vercel serverless or Express):**  
- `SUPABASE_URL` — Supabase project URL  
- `SUPABASE_SERVICE_ROLE_KEY` — Service role key  
- `SUPABASE_JWT_SECRET` — (optional) for local JWT verify  
- `CORS_ORIGIN` — Allowed frontend origin  
- `PORT` — (Express only) e.g. 3001  

### 7.2 Migrations

- Apply in order: `supabase/migrations/00001_initial_schema.sql`, then `00002_currency_gst_tax.sql` (adds currency, gstin, tax_percent on tenants; tax_percent, tax_amount on invoices). Run in Supabase SQL Editor or via CLI.

### 7.3 Vercel

- Frontend and serverless API in same repo; `vercel.json` rewrites non-`api/*` to `index.html` for SPA. API routes live under `api/`.

---

## 8. Testing & Validation

- **Isolation:** Two tenants; create data as Tenant A; as Tenant B call list and get by A’s IDs → only B’s data or 404.
- **Auth:** No/invalid JWT → 401; valid JWT but no user row → 403.
- **Invoice workflow:** Create draft → edit → print → Mark Sent → Mark Paid; delete only when draft.
- **Settings:** Update name, currency, GSTIN, tax %; refetch me; create invoice and confirm tax and currency on print view.
- **Export CSV:** GET /api/invoices?format=csv with auth → CSV download; list still returns { data, total } when format not csv.

---

## 9. Future Enhancements (from roadmap)

- Multiple users per tenant (invite, roles).
- Subdomain or path per tenant.
- Payment gateway integration (mark paid via webhook).
- Reporting (sales by period, top products).
- RLS in Postgres as defence in depth.
- Audit logging (who created/updated what).

---

*This document reflects the application state after Tier 3 (pagination, currency/GST/tax, CSV export) and serves as the single reference for architecture, data model, APIs, and frontend behavior.*

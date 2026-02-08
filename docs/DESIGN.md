# Multi-Tenant Billing Web Application — System Design & Implementation Guide

**Stack:** React (Vite) + Node.js/Express + PostgreSQL (Supabase)  
**Target:** Small shop owners, India; one login = one shop (MVP).  
**Goal:** Single app, multiple shops; full tenant data isolation; production-ready MVP.

---

## PHASE 1: System Design

### 1.1 What is multi-tenancy?

**Definition:** One deployed application serves many independent customers (tenants). Each tenant’s data must be isolated so that Tenant B cannot see or change Tenant A’s data.

**Real-world examples:**
- **Shopify:** One product, many stores; each store sees only its orders/products.
- **Slack:** One app, many workspaces; each workspace has its own channels and members.
- **This app:** One billing app, many shops; each shop has its own products, customers, and invoices.

**Why it matters:** Building one app and reusing it for many shops is cheaper and faster than deploying one app per shop. Data isolation is a hard requirement for trust and compliance.

### 1.2 Three common approaches

| Approach | Description | Pros | Cons |
|----------|-------------|------|------|
| **Single DB + tenant_id** | One database; every tenant-scoped table has a `tenant_id` column; every query filters by `tenant_id`. | Simple ops, one codebase, easy backups, simple migrations. | One bad query can leak data; must enforce tenant_id everywhere. |
| **DB per tenant** | Separate PostgreSQL database per tenant. | Strong isolation, easy to move a tenant to another server. | Many DBs to backup/migrate; connection pooling and tooling get complex. |
| **Schema per tenant** | One DB, one schema per tenant (e.g. `shop_a`, `shop_b`). | Good isolation, one DB to manage. | Migrations must run on every schema; restoring one tenant is trickier. |

### 1.3 Why we choose: Single DB + tenant_id

**Reasons:**
1. **MVP speed:** One schema, one migration path, one connection string. No dynamic schema/DB switching.
2. **Supabase fit:** Supabase is one Postgres project; row-level security (RLS) and `tenant_id` columns are natural.
3. **Cost:** Single DB is cheaper than many DBs or complex pooling.
4. **Operational simplicity:** Backups, point-in-time recovery, and monitoring are standard.

**Critical rule:** Backend **always** sets `tenant_id` from the authenticated context (e.g. JWT or session), **never** from client input. Frontend must never be trusted to send or choose `tenant_id`.

### 1.4 Logical architecture (text + ASCII)

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                     INTERNET                              │
                    └─────────────────────────┬──────────────────────────────┘
                                               │
                    ┌──────────────────────────▼──────────────────────────────┐
                    │  VERCEL (Frontend)                                        │
                    │  - React SPA (Vite)                                       │
                    │  - Supabase Auth JS client (login/signup, JWT)            │
                    │  - All business API calls → Express backend              │
                    │  - No direct Supabase DB access for tenant data           │
                    └──────────────────────────┬──────────────────────────────┘
                                               │ HTTPS + JWT in Authorization
                    ┌──────────────────────────▼──────────────────────────────┐
                    │  EXPRESS BACKEND (Supabase Edge / VPS / Railway)          │
                    │  - Validates Supabase JWT                                │
                    │  - Resolves tenant_id from users table (by auth.uid)      │
                    │  - All queries filtered by tenant_id                    │
                    │  - Uses Supabase Service Role for DB (server-side only)   │
                    └──────────────────────────┬──────────────────────────────┘
                                               │
                    ┌──────────────────────────▼──────────────────────────────┐
                    │  SUPABASE                                                 │
                    │  - PostgreSQL (tenants, users, products, customers,     │
                    │    invoices, invoice_items)                              │
                    │  - Supabase Auth (email/password; JWT issued here)       │
                    └─────────────────────────────────────────────────────────┘
```

**Data flow (example: List products):**
1. User logs in via Supabase Auth → receives JWT (contains `sub` = Supabase user id).
2. Frontend calls `GET /api/products` with `Authorization: Bearer <JWT>`.
3. Backend verifies JWT with Supabase, extracts `sub`, looks up `users` table → gets `tenant_id`.
4. Backend runs: `SELECT * FROM products WHERE tenant_id = $1` (never from request body).
5. Response returns only that tenant’s products.

---

## PHASE 2: Database Design

### 2.1 Tables for MVP

| Table | Purpose |
|-------|--------|
| **tenants** | One row per shop; name, slug, created_at. |
| **users** | Links Supabase Auth user (auth_id) to one tenant; one user per tenant in MVP. |
| **products** | Tenant’s products; name, price, unit; tenant_id for isolation. |
| **customers** | Tenant’s customers; name, email, phone, address; tenant_id. |
| **invoices** | Header per invoice; tenant_id, customer_id, number, date, status, totals. |
| **invoice_items** | Line items; invoice_id, product_id, qty, unit_price, amount. |

Supabase Auth stores identities in `auth.users`; we do not create that table. We only have our app tables in `public`.

### 2.2 Column-level description

**tenants**
- `id` (uuid, PK): Unique tenant identifier.
- `name` (text): Shop display name.
- `slug` (text, unique): URL-friendly identifier (e.g. for future subdomains).
- `created_at` (timestamptz): Creation time.

**users**
- `id` (uuid, PK): Our internal user row id.
- `auth_id` (uuid, unique): Supabase Auth user id (`auth.uid()` / JWT `sub`). Links to Supabase Auth only by convention; no FK to `auth.users` in public schema.
- `tenant_id` (uuid, FK → tenants): Which shop this user belongs to.
- `email` (text): Denormalized from auth for display; must stay in sync on signup/update.
- `created_at` (timestamptz): Creation time.

**products**
- `id` (uuid, PK): Product id.
- `tenant_id` (uuid, FK → tenants): Owner tenant; every query filters by this.
- `name` (text): Product name.
- `price` (numeric): Unit price.
- `unit` (text): e.g. "pc", "kg", "box".
- `created_at` (timestamptz): Creation time.

**customers**
- `id` (uuid, PK): Customer id.
- `tenant_id` (uuid, FK → tenants): Owner tenant.
- `name` (text): Customer name.
- `email` (text, nullable): Email.
- `phone` (text, nullable): Phone.
- `address` (text, nullable): Billing address.
- `created_at` (timestamptz): Creation time.

**invoices**
- `id` (uuid, PK): Invoice id.
- `tenant_id` (uuid, FK → tenants): Owner tenant.
- `customer_id` (uuid, FK → customers): Bill-to customer (must belong to same tenant).
- `invoice_number` (text): Human-readable number, unique per tenant (e.g. INV-0001).
- `invoice_date` (date): Invoice date.
- `status` (text): e.g. 'draft' | 'sent' | 'paid'.
- `subtotal` (numeric): Sum of line items before tax (MVP: no tax).
- `total` (numeric): Total amount.
- `created_at`, `updated_at` (timestamptz): Audit.

**invoice_items**
- `id` (uuid, PK): Line item id.
- `invoice_id` (uuid, FK → invoices): Parent invoice (enforces tenant via invoice).
- `product_id` (uuid, FK → products, nullable): Optional link to product (snapshot name/price in item).
- `description` (text): Line description (from product name or manual).
- `quantity` (numeric): Qty.
- `unit_price` (numeric): Price per unit at time of invoice.
- `amount` (numeric): quantity * unit_price (stored for consistency).

### 2.3 PostgreSQL SQL for each table

See `supabase/migrations/00001_initial_schema.sql` in the repo. Summary:

- All tenant-scoped tables have `tenant_id` and FK to `tenants(id)`.
- `invoices` has FK to `customers`; `invoice_items` has FK to `invoices` and optional FK to `products`.
- Unique constraint: `(tenant_id, invoice_number)` on `invoices`.
- Indexes: `tenant_id` (and composite where useful) on all tenant-scoped tables; index on `users(auth_id)` for login lookup.

### 2.4 How tenant isolation works at DB level

1. **Application-level (primary):** Every API that reads/writes tenant data receives `tenant_id` from the backend after JWT validation and user lookup. Every query includes `WHERE tenant_id = $1` (with that value). No `tenant_id` is ever taken from request body or query params.

2. **Optional RLS (defence in depth):** Row Level Security policies can enforce that rows are visible/editable only when `tenant_id` matches the current role. For MVP we rely on application-level enforcement and a single service-role connection from the backend; RLS can be added later without changing table design.

### 2.5 Example rows (two tenants)

**Tenant A (Shop “Kiran Store”):**
- tenants: id=ta-1, name='Kiran Store', slug='kiran-store'
- users: auth_id=user-supabase-1, tenant_id=ta-1
- products: (ta-1, 'Rice 1kg', 80, 'kg'), (ta-1, 'Soap', 30, 'pc')
- customers: (ta-1, 'Customer 1', 'c1@example.com', ...)
- invoices: (ta-1, INV-0001, customer_1, draft, 110, 110)

**Tenant B (Shop “City Mart”):**
- tenants: id=tb-1, name='City Mart', slug='city-mart'
- users: auth_id=user-supabase-2, tenant_id=tb-1
- products: (tb-1, 'Bread', 40, 'pc')
- customers: (tb-1, 'Customer B', ...)
- invoices: (tb-1, INV-0001, ...)  ← Same invoice_number as A is allowed; uniqueness is per tenant.

No row from Tenant A is visible to Tenant B because every API filters by `tenant_id` resolved from the authenticated user.

### 2.6 Indexing strategy

- **tenants:** PK on `id`; unique on `slug`.
- **users:** PK on `id`; unique on `auth_id` (for JWT → tenant lookup); index on `tenant_id` if you list users by tenant later.
- **products:** PK on `id`; index on `(tenant_id)`; optional index on `(tenant_id, name)` for sorted list.
- **customers:** PK on `id`; index on `(tenant_id)`; optional `(tenant_id, name)`.
- **invoices:** PK on `id`; unique on `(tenant_id, invoice_number)`; index on `(tenant_id)`, index on `(tenant_id, invoice_date)` for listing.
- **invoice_items:** PK on `id`; index on `(invoice_id)` for loading lines by invoice.

---

## PHASE 3: Authentication & Tenant Creation

### 3.1 Step-by-step signup flow

1. User submits email + password on signup form.
2. Frontend calls Supabase Auth `signUp({ email, password })`. Supabase creates the identity in `auth.users` and returns a session (JWT). No tenant exists yet.
3. Frontend sends a request to **our backend** `POST /api/signup/complete` with the same JWT in `Authorization`, and body `{ shopName: "Kiran Store" }`. Backend:
   - Verifies JWT and gets `auth_id` (sub).
   - If a row in `users` already exists for this `auth_id`, returns 400 (already onboarded).
   - Creates a row in `tenants` (name from shopName, slug from slugify(shopName) + short id if needed for uniqueness).
   - Creates a row in `users` with `auth_id`, `tenant_id` = new tenant, `email` from JWT or body.
   - Returns 201 and optionally tenant + user info.
4. Frontend stores session (Supabase client handles this) and then uses the same JWT for all `/api/*` calls. Backend never trusts tenant from client; it always resolves tenant from `users` by `auth_id`.

### 3.2 How tenant is created

- Only in `POST /api/signup/complete`, in one transaction: insert into `tenants`, then insert into `users` with that `tenant_id`. No other API creates tenants in MVP.

### 3.3 How user is linked to tenant

- `users.tenant_id` FK to `tenants.id`. One user → one tenant in MVP. Backend resolves: JWT → auth_id → `SELECT tenant_id FROM users WHERE auth_id = $1` → use that `tenant_id` for all subsequent queries in that request.

### 3.4 JWT structure and claims

- We use Supabase-issued JWTs. Typical claims: `sub` (Supabase user uuid), `email`, `role` (e.g. authenticated). We do **not** store tenant_id in the JWT. We resolve tenant_id on the server from `users` table by `auth_id` (= sub). This keeps JWT small and avoids stale tenant if we later support multi-tenant membership.

### 3.5 How tenant_id flows securely

1. Client sends only `Authorization: Bearer <Supabase JWT>`.
2. Backend middleware: verify JWT with Supabase (JWT secret / JWKS); extract `sub`; query `users` for `tenant_id`; attach to `req.tenantId` and `req.authId`. If no user row, respond 403.
3. All route handlers use `req.tenantId` for DB filters. They never read tenant_id from body or query.

### 3.6 Security risks and mitigations

| Risk | Mitigation |
|------|------------|
| Client sends tenant_id | Backend ignores it; always uses `req.tenantId` from DB lookup. |
| Forged JWT | Verify with Supabase JWT secret; use HTTPS only. |
| User row missing after auth | Require signup-complete flow before allowing API access; 403 if no user. |
| SQL injection | Use parameterized queries only (`$1`, `$2`). |
| Cross-tenant ID guessing | All resource IDs are UUIDs; even if guessed, every query still filters by tenant_id so other tenant’s rows are never returned. |

---

## PHASE 4: Backend APIs (Detailed)

Base URL: `https://api.example.com` (or your backend URL). All authenticated endpoints require `Authorization: Bearer <Supabase JWT>`.

### 4.1 Signup (complete onboarding)

- **Endpoint:** `POST /api/signup/complete`
- **Method:** POST
- **Headers:** `Authorization: Bearer <JWT>`, `Content-Type: application/json`
- **Request body:** `{ "shopName": "My Shop" }`
- **Validation:** `shopName` required, non-empty string, max length 200; trim.
- **Authorization:** Valid JWT; must not already have a user row (first-time signup complete only).
- **Logic:** In a transaction: insert into `tenants` (name, slug); insert into `users` (auth_id from JWT sub, tenant_id, email). Return 201 with `{ tenant: { id, name, slug }, user: { id, email } }`.
- **Errors:** 400 if already onboarded or invalid body; 401 if invalid/missing JWT.

### 4.2 Login

- Login is handled by Supabase Auth (frontend). Backend does not expose a separate login endpoint; it only validates the JWT that Supabase issues. Optional: `GET /api/me` that returns current user + tenant using `req.tenantId` and `req.authId` (for UI to show shop name).

### 4.3 Create product

- **Endpoint:** `POST /api/products`
- **Body:** `{ "name": "Rice 1kg", "price": 80, "unit": "kg" }`
- **Validation:** name required, non-empty, max 500; price required, >= 0; unit optional, max 50.
- **Authorization:** Valid JWT; tenant resolved from users.
- **SQL:** `INSERT INTO products (id, tenant_id, name, price, unit, created_at) VALUES (gen_random_uuid(), $1, $2, $3, $4, now()) RETURNING *`. $1 = req.tenantId.
- **Response:** 201 + created row (id, tenant_id, name, price, unit, created_at).
- **Errors:** 400 validation; 401/403 auth.

### 4.4 List products

- **Endpoint:** `GET /api/products`
- **Query:** Optional `q` for search (filter by name ilike).
- **Authorization:** Valid JWT; tenant from users.
- **SQL:** `SELECT * FROM products WHERE tenant_id = $1 [AND name ILIKE $2] ORDER BY name`. $1 = req.tenantId.
- **Response:** 200 + array of products.
- **Errors:** 401/403 auth.

### 4.5 Create customer

- **Endpoint:** `POST /api/customers`
- **Body:** `{ "name": "Customer Name", "email": "a@b.com", "phone": "+91...", "address": "..." }`
- **Validation:** name required, non-empty, max 500; email/phone/address optional, sensible max lengths.
- **Authorization:** Valid JWT; tenant from users.
- **SQL:** `INSERT INTO customers (id, tenant_id, name, email, phone, address, created_at) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, now()) RETURNING *`.
- **Response:** 201 + created customer.
- **Errors:** 400 validation; 401/403 auth.

### 4.6 List customers

- **Endpoint:** `GET /api/customers`
- **Query:** Optional `q` for search (name/email).
- **Authorization:** Valid JWT.
- **SQL:** `SELECT * FROM customers WHERE tenant_id = $1 [AND (name ILIKE $2 OR email ILIKE $2)] ORDER BY name`.
- **Response:** 200 + array of customers.
- **Errors:** 401/403 auth.

### 4.7 Create invoice

- **Endpoint:** `POST /api/invoices`
- **Body:** `{ "customerId": "uuid", "invoiceDate": "2025-02-07", "status": "draft", "items": [ { "productId": "uuid" (optional), "description": "Rice", "quantity": 2, "unitPrice": 80 } ] }`
- **Validation:** customerId required, must be UUID and belong to same tenant; invoiceDate required, valid date; status one of draft/sent/paid; items array required, each with description, quantity > 0, unitPrice >= 0; productId optional.
- **Authorization:** Valid JWT; tenant from users.
- **Logic:** (1) Resolve next invoice_number for tenant (e.g. `SELECT COALESCE(MAX(sequence), 0) + 1` from a sequence or from max invoice_number per tenant). Format e.g. `INV-0001`. (2) Verify customer belongs to tenant. (3) For each item, if productId given, ensure product belongs to tenant and optionally fill description/unit_price from product. (4) Compute amount per line, subtotal, total. (5) Insert invoice; insert invoice_items. All in one transaction.
- **Response:** 201 + full invoice with items.
- **Errors:** 400 validation or customer not found; 401/403 auth.

### 4.8 Get invoices

- **Endpoint:** `GET /api/invoices`
- **Query:** Optional `status`, `customerId`, limit/offset for pagination.
- **Authorization:** Valid JWT.
- **SQL:** `SELECT * FROM invoices WHERE tenant_id = $1 [AND status = $2] [AND customer_id = $3] ORDER BY created_at DESC LIMIT $4 OFFSET $5`. Then load items for returned ids or use a join.
- **Response:** 200 + array of invoices (with items or with item count).

### 4.9 Get single invoice

- **Endpoint:** `GET /api/invoices/:id`
- **Authorization:** Valid JWT; invoice must belong to req.tenantId.
- **SQL:** `SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2`; then `SELECT * FROM invoice_items WHERE invoice_id = $1`. If invoice not found, 404.
- **Response:** 200 + invoice + items.
- **Errors:** 404 if not found or wrong tenant; 401/403 auth.

---

## PHASE 5: Frontend Implementation

### 5.1 Project setup

- Existing Vite + React app; add React Router for routes. No Supabase client direct access to tenant tables from browser; frontend uses Supabase only for Auth (login/signup). All product/customer/invoice APIs go to Express backend with JWT.

### 5.2 Folder structure

```
src/
  api/           # API client (fetch to backend with auth header)
  components/    # Reusable UI (Button, Input, Card, etc.)
  contexts/      # AuthContext (user, tenant, session, login, logout, signupComplete)
  pages/         # Login, Signup, Dashboard, Products, Customers, Invoices, CreateInvoice
  hooks/         # useAuth, useApi
  lib/           # supabaseClient (auth only), constants
  App.jsx
  main.jsx
```

### 5.3 Auth handling

- AuthContext: get session from Supabase on mount; expose user, tenant (from /api/me or stored after signup/complete), loading, login(), logout(), signup(), signupComplete(shopName). All API calls use session?.access_token in Authorization header. If 401, clear session and redirect to login.

### 5.4 Protected routes

- Route wrapper: if !session and route is protected, redirect to /login. If session but no tenant (user row missing), redirect to /signup/complete (onboarding). Otherwise render children.

### 5.5 State management

- Server state: products, customers, invoices fetched via API; keep in React state or simple fetch-on-mount per page. No global store required for MVP. Auth state in AuthContext.

### 5.6 API integration

- Single `api` helper: baseURL from env; method, path, body; get token from Supabase session; add Authorization header; throw on 4xx/5xx with message; return JSON. All tenant-scoped data only via this API; no Supabase from('products') from frontend.

### 5.7 Invoice creation UI flow

- Page: Select customer (dropdown from GET /api/customers); date; add lines (product dropdown from GET /api/products or free text description, qty, unit price); show running total; submit POST /api/invoices; redirect to invoice list or print view.

### 5.8 Tenant isolation never trusted to frontend

- Frontend never sends tenant_id. It only sends JWT. Backend derives tenant_id from JWT and uses it for every query. So even a malicious client cannot access another tenant’s data.

---

## PHASE 6: Invoice Generation

### 6.1 Invoice number strategy (per tenant)

- Per-tenant sequence: e.g. table `tenant_sequences` (tenant_id, key, value) or compute `SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM '[0-9]+') AS INT)), 0) + 1` from invoices WHERE tenant_id = $1. Format as INV-0001, INV-0002. Uniqueness: unique(tenant_id, invoice_number). Two tenants can both have INV-0001.

### 6.2 PDF generation approach

- **Option A (MVP):** Print-friendly HTML; user uses browser Print → Save as PDF. No server-side PDF library. Fast to ship.
- **Option B:** Server-side PDF (e.g. Puppeteer, react-pdf, or lib like pdfkit) and store file; return URL. Recommend **Option A for MVP** to avoid binary dependencies and storage; add Option B when you need “Download PDF” without print dialog.

### 6.3 Print-friendly layout

- Dedicated route e.g. `/invoices/:id/print` that fetches invoice + items and renders a clean layout (shop name, customer, date, number, table of lines, total). CSS: @media print { body { ... } }, hide nav/buttons when printing.

### 6.4 Storage strategy (DB vs file)

- **MVP:** Invoice data (header + items) already in DB. No file storage; PDF is generated on-demand (print) or not stored. If later you add server-side PDF, store in Supabase Storage under `tenants/{tenant_id}/invoices/{id}.pdf` and link in DB (e.g. invoice.pdf_url).

### 6.5 Edge cases

- Empty items: reject in API (validation). Deleted product: invoice_items keep description/unit_price snapshot; product_id can be null or broken; display “Product removed” if product_id not found. Concurrent invoice number: use transaction + unique constraint; retry on conflict. Very long decimal: store as numeric(12,2); display with 2 decimals.

---

## PHASE 7: Deployment

### 7.1 Environment variables

**Frontend (Vite):**
- `VITE_SUPABASE_URL` — Supabase project URL (Auth).
- `VITE_SUPABASE_ANON_KEY` — Supabase anon key (for Auth only).
- `VITE_API_URL` — Backend base URL (e.g. https://api.yourproject.com).

**Backend:**
- `SUPABASE_URL` — Same Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY` — Service role key (never in frontend); for DB access from Express.
- `PORT` — Server port (e.g. 3000).
- `CORS_ORIGIN` — Allowed frontend origin (e.g. https://yourapp.vercel.app).

**Supabase Dashboard:**
- Create project; run migrations in SQL editor or via Supabase CLI; note URL and keys.

### 7.2 Backend deployment steps

1. Create backend project (Express); install deps (express, pg or @supabase/supabase-js, jsonwebtoken or use Supabase JWT verify).
2. Set env vars in hosting (VPS/Railway/Render/Supabase Edge): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PORT, CORS_ORIGIN.
3. Build: no build step for plain Node; or use type build if TypeScript. Start: `node server.js` or `node index.js`.
4. Use process manager (e.g. PM2) on VPS; or platform’s start command. Enable HTTPS (platform or reverse proxy).

### 7.3 Frontend deployment steps

1. Set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL in Vercel env.
2. `npm run build`; Vercel uses output from `vite build` (default `dist`). Deploy from Git; Vercel runs build with env injected.

### 7.4 Database migrations

- Keep SQL in `supabase/migrations/` or repo `migrations/` folder. Apply in order (00001_initial_schema.sql, etc.). In Supabase: run each file in SQL Editor, or use Supabase CLI `supabase db push`. Never edit applied migrations; add new ones for changes.

### 7.5 CORS configuration

- Backend: allow origin = CORS_ORIGIN (single frontend URL); credentials true if using cookies; methods GET, POST, PUT, PATCH, DELETE; headers Authorization, Content-Type. Do not use * for origin in production.

### 7.6 Production checklist

- [ ] Env vars set and not committed. [ ] Migrations applied. [ ] Backend returns 401 for invalid/missing JWT. [ ] Frontend uses VITE_API_URL for all tenant data. [ ] Invoice numbers unique per tenant. [ ] HTTPS only. [ ] CORS restricted to frontend origin.

---

## PHASE 8: Testing & Validation

### 8.1 Tenant data isolation tests

- Create two tenants (two users, signup complete for each). Create products/customers/invoices for Tenant A. As Tenant B, call GET /api/products, GET /api/invoices, GET /api/invoices/:id (with A’s invoice id). All must return only B’s data or 404; never A’s.

### 8.2 Security tests

- No Authorization header → 401. Invalid JWT → 401. Valid JWT but no user row → 403. Try sending tenant_id in body on create product → backend must ignore and use resolved tenant_id (verify with second tenant).

### 8.3 Performance checks

- List products/customers/invoices with 100+ rows; response time acceptable. Add index on (tenant_id, created_at) if listing by date.

### 8.4 Manual test cases

- Signup → complete with shop name → see dashboard. Create product, customer; create invoice with 2 lines; open print view; print to PDF. Logout; login again; see same data. Second user; signup second shop; verify data separate.

---

## PHASE 9: MVP to SaaS Roadmap

### 9.1 What to build next

- Multiple users per tenant (invite by email; roles: owner, staff). Subdomain or path per tenant (e.g. kiran-store.yourapp.com). Payment collection (link payment gateway; mark invoice paid). GST fields and compliance (India). Reporting (sales by period, top products).

### 9.2 What NOT to touch yet

- Do not add multi-tenant in JWT until you have multi-tenant membership (e.g. user in two shops). Do not split DB per tenant without clear need. Do not over-engineer roles (single owner per shop is enough for MVP).

### 9.3 How to add

- **Multiple users per tenant:** Add `tenant_members` (tenant_id, user_id, role); resolve tenant from JWT + selected context or from invite. **Subdomains:** Resolve tenant from Host header or path; ensure backend validates tenant membership for that user. **Payments:** Store payment_link or transaction_id on invoice; webhook to update status; idempotency.

### 9.4 Technical debt warnings

- Invoice number generation: move to a dedicated sequence table or advisory lock if you see conflicts under load. Add RLS as second layer of defence once you have time. Log audit events (who created/updated what) for compliance later.

---

*End of design document. Implementation follows in repo: migrations, backend, frontend, and deployment scripts.*

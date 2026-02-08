# Multi-tenant Billing MVP

One app, multiple shops. Each shop’s data is isolated by tenant. Tech: **React (Vite)** + **Node (Express)** + **PostgreSQL (Supabase)**. Target: small shop owners (India); simple invoice generation (no GST in MVP).

## What’s in this repo

- **Frontend** (root): React app — auth (Supabase), dashboard, products, customers, invoices, print view.
- **Backend** (`server/`): Express API — JWT validation, tenant resolution, CRUD for products, customers, invoices.
- **Database**: Supabase (PostgreSQL). Schema in `supabase/migrations/00001_initial_schema.sql`.
- **Docs**: `docs/DESIGN.md` (full system design), `docs/DEPLOYMENT.md`, `docs/TESTING.md`.

## Quick start (local)

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In SQL Editor, run the contents of `supabase/migrations/00001_initial_schema.sql`.
3. In Project Settings → API, copy **Project URL**, **anon (public) key**, **service_role key**, and **JWT Secret**.

### 2. Backend

```bash
cd server
cp .env.example .env
# Edit .env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET, CORS_ORIGIN=http://localhost:5173
npm install
npm run dev
```

Backend runs at `http://localhost:3001`. Check `http://localhost:3001/health` → `{"status":"ok"}`.

### 3. Frontend

```bash
# from repo root
cp .env.example .env.local
# Edit .env.local: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (or VITE_SUPABASE_KEY), VITE_API_URL=http://localhost:3001
npm install
npm run dev
```

Open `http://localhost:5173`. Sign up → complete “Create your shop” → add products/customers → create invoice → use “Print / Save as PDF”.

## Scripts

| Where   | Command        | Purpose              |
|---------|----------------|----------------------|
| Root    | `npm run dev`  | Vite frontend        |
| Root    | `npm run build`| Production build     |
| Server  | `npm run dev`  | Express with watch   |
| Server  | `npm start`    | Run API (production) |

## Tenant isolation

- **Backend** resolves `tenant_id` from the JWT (Supabase `sub`) via the `users` table. It **never** uses `tenant_id` from the request body or query.
- **Frontend** never sends `tenant_id`; it only sends the JWT. All tenant-scoped requests go to the Express API.

## Deployment

See **docs/DEPLOYMENT.md** for env vars, migrations, backend (Railway/Render/VPS), frontend (Vercel), and CORS.

## Testing

See **docs/TESTING.md** for tenant isolation checks, security tests, and manual test cases.

## Design (all 9 phases)

See **docs/DESIGN.md** for: system design, DB design, auth & tenant creation, API spec, frontend structure, invoice generation, deployment notes, testing, and MVP → SaaS roadmap.

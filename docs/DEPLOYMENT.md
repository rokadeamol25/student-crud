# Deployment — Multi-tenant Billing MVP

## 1. Environment variables

### Frontend (Vercel)

| Variable | Purpose |
|----------|--------|
| `VITE_SUPABASE_URL` | Supabase project URL (Auth) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (Auth only; never use service role in frontend) |
| `VITE_API_URL` | Backend API base URL (e.g. `https://your-api.railway.app`) |

Set these in Vercel: Project → Settings → Environment Variables. Use the same values for Production and Preview if you use one backend.

### Backend (Railway / Render / VPS)

| Variable | Purpose |
|----------|--------|
| `SUPABASE_URL` | Same Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key from Supabase (Project Settings → API). Never expose in frontend. |
| `SUPABASE_JWT_SECRET` | JWT Secret from Supabase (Project Settings → API). Used to verify access tokens. |
| `PORT` | Server port (e.g. 3000 or 3001). Railway/Render set this automatically. |
| `CORS_ORIGIN` | Allowed frontend origin, e.g. `https://yourapp.vercel.app` (no trailing slash). |

**Common mistake:** Using anon key in backend. Always use service role for server-side DB access.  
**Common mistake:** Leaving `CORS_ORIGIN` as `*` in production. Set the exact frontend URL.

---

## 2. Database migrations

1. Open Supabase Dashboard → SQL Editor.
2. Run the contents of `supabase/migrations/00001_initial_schema.sql` in order (copy-paste or run the file).
3. Verify tables: `tenants`, `users`, `products`, `customers`, `invoices`, `invoice_items`.

**Verification:** In Table Editor you should see empty tables with the correct columns. Do not add data manually; use the app signup flow.

---

## 3. Backend deployment steps

### Option A: Railway / Render

1. Create a new project; connect the repo (or upload `server` folder if separate repo).
2. Root directory: set to `server` if the backend is in a `server` subfolder of the same repo.
3. Build command: leave empty (Node app, no build).
4. Start command: `node index.js` or `npm start`.
5. Add all environment variables above.
6. Deploy. Note the public URL (e.g. `https://billing-api.railway.app`).

### Option B: VPS (e.g. Ubuntu)

1. Clone repo on server. Install Node 18+.
2. `cd server && npm install --production`.
3. Create `.env` with all backend variables. Use `PORT=3000` and a process manager (PM2):
   ```bash
   npm install -g pm2
   pm2 start index.js --name billing-api
   pm2 save && pm2 startup
   ```
4. Put Nginx (or Caddy) in front; proxy `/` to `http://127.0.0.1:3000`; enable HTTPS (e.g. Let’s Encrypt).

**Verification:** `curl https://your-api-url/health` returns `{"status":"ok"}`.

---

## 4. Frontend deployment (Vercel)

1. Connect the repo to Vercel. Framework: Vite (auto-detected).
2. Set environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL` (your backend URL).
3. Build command: `npm run build`. Output: `dist`.
4. Deploy. Set production URL in backend `CORS_ORIGIN`.

**Verification:** Open the app URL; you should see the login page. Sign up and complete “Create your shop”; then you can add products and create an invoice.

---

## 5. CORS configuration

Backend already uses `CORS_ORIGIN` in `server/src/app.js`:

```js
const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
app.use(cors({ origin: corsOrigin, credentials: true }));
```

For production, set `CORS_ORIGIN=https://your-app.vercel.app` (no trailing slash). For local dev with frontend on 5173 and backend on 3001, default is fine.

---

## 6. Production checklist

- [ ] Supabase: migrations applied; no direct client access to tenant tables from frontend (all via backend).
- [ ] Backend: `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_JWT_SECRET` set; not logged or exposed.
- [ ] Frontend: `VITE_API_URL` points to the deployed backend; no service role or JWT secret in frontend.
- [ ] CORS: `CORS_ORIGIN` set to the exact frontend origin.
- [ ] Auth: Sign up → Complete signup (create shop) → then all API calls use JWT; backend resolves `tenant_id` from `users` table.
- [ ] HTTPS only in production (Vercel and Railway/Render provide it by default).

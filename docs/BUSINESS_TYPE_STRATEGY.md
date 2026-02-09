# Business-type strategy: one MVP, many variants

This doc describes how to keep the billing app **one codebase** while allowing **business-type-specific behaviour** (e.g. show/hide columns on product creation, different product search on invoices).

## Principles

1. **Single codebase** – No forking. All platforms share the same app; behaviour is driven by **tenant configuration**.
2. **Tenant-level type** – Each tenant has a `business_type` (e.g. `default`, `retail`, `services`). The backend exposes it via `/api/me`; the frontend uses it to look up **feature config**.
3. **Config in code first** – Default and variant behaviour live in `src/config/businessTypes.js`. No DB config required for launch; you can later add DB-driven overrides if needed.
4. **Backend stays generic** – APIs remain tenant-scoped and uniform. Optional query params (e.g. `search_by=name|sku`) can be added and used by any client; the frontend chooses params based on `business_type`.

## Data model

- **`tenants.business_type`** (nullable text, e.g. `default`, `retail`, `services`, `manufacturing`).
- Default: `null` or `'default'` → use the default feature set.
- Other values map to keys in `src/config/businessTypes.js`.

## Feature config shape

Config is keyed by `business_type`. Each key holds:

- **`productForm`** – Controls product creation/edit and list:
  - `showUnit` (boolean)
  - `showHsnSacCode` (boolean)
  - `showTaxPercent` (boolean)
  - (Future: `showSku`, `showBarcode`, etc.)
- **`invoiceProductSearch`** – Controls how products are chosen on invoices:
  - `method`: `'dropdown'` (load N products, pick from `<select>`) or `'typeahead'` (search-as-you-type with `q=`).
  - `searchBy`: `'name'` (current), or later `'sku'`, `'name_or_sku'`, `'barcode'` when backend supports it.
  - `limit` / `debounceMs` for typeahead.

New features (e.g. extra columns, new search methods) are added as new config keys; new business types are new keys that override only what’s different.

## Where it’s used

| Area | What varies | How |
|------|-------------|-----|
| **Product creation (Products.jsx)** | Which fields/columns are shown (unit, HSN/SAC, tax %) | Read `productForm` from config; render fields and table columns only when enabled. |
| **Product list (Products.jsx)** | Same as above | Same `productForm`; table headers and cells conditional. |
| **Invoice line product picker (CreateInvoice / EditInvoice)** | How products are loaded and searched (dropdown vs typeahead, which params) | Read `invoiceProductSearch`; if `method === 'typeahead'`, call `/api/products?q=...&limit=...` on input; otherwise load once with `limit=500`. Use `searchBy` when backend supports multiple search fields. |

## Backend evolution

- **Now:** Products list supports `q` (ilike on name), `limit`, `offset`. No `business_type` in API logic.
- **Later:** Add optional `search_by=name|sku|barcode` and/or `search=` when you add `sku`/`barcode` to products. Frontend sends params based on `invoiceProductSearch.searchBy`.
- **Optional:** Endpoint like `GET /api/me/config` that merges server-side feature flags with `business_type` for A/B or gradual rollout.

## Adding a new business type

1. Add a key in `src/config/businessTypes.js` (e.g. `services`) with only the overrides (other keys fall back to `default`).
2. Set `tenants.business_type = 'services'` for that tenant (via SQL, admin UI, or signup flow).
3. No backend route changes needed unless you add new query params or search fields.

## Adding a new variant feature

1. Add the option to the config shape (e.g. `productForm.showCost`).
2. In the relevant page, read config and branch (show/hide column, or use typeahead vs dropdown).
3. If the feature needs new API params (e.g. search by SKU), add them in the backend and then set `searchBy` in config for the right business types.

## Files touched

- **`supabase/migrations/00009_tenant_business_type.sql`** – add `business_type` to `tenants`.
- **`server/src/routes/me.js`** – include `business_type` in tenant payload.
- **`src/config/businessTypes.js`** – default and variant configs.
- **`src/hooks/useBusinessConfig.js`** (or inline) – `useBusinessConfig()` from AuthContext tenant → merged config.
- **`src/pages/Products.jsx`** – use `productForm` for add form and table columns.
- **`src/pages/CreateInvoice.jsx`** / **`EditInvoice.jsx`** – use `invoiceProductSearch` for product picker (dropdown vs typeahead, params).

This keeps the app common across platforms while allowing per–business-type behaviour without duplicating code.

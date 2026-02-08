# Testing & Validation — Multi-tenant Billing MVP

## 1. Tenant data isolation

**Purpose:** Ensure Tenant B never sees or changes Tenant A’s data.

**Steps:**

1. Sign up with User A (e.g. user-a@test.com); complete signup with shop name “Shop A”.
2. Add a product “Product A” and a customer “Customer A”. Create one invoice.
3. Log out. Sign up with User B (user-b@test.com); complete signup with shop name “Shop B”.
4. Add a product “Product B” and a customer “Customer B”.
5. As User B:
   - List products: only “Product B” must appear.
   - List customers: only “Customer B” must appear.
   - List invoices: only Shop B’s invoice(s) must appear.
6. (Optional) As User B, call `GET /api/invoices/{invoice_id_of_shop_a}` with the invoice id from Shop A (e.g. from DB or network tab). Expected: **404** or empty; never Shop A’s data.

**Verification:** No cross-tenant data in UI or API responses. Backend never uses `tenant_id` from request body; it always uses the value resolved from the JWT → `users` table.

---

## 2. Security tests

| Test | Action | Expected |
|------|--------|----------|
| No token | Call `GET /api/products` without `Authorization` header | 401 |
| Invalid token | Call with `Authorization: Bearer invalid` | 401 |
| Valid token, no user row | Use a JWT from Supabase Auth for a user that has not called “Complete signup” | 403 “User not onboarded” |
| Tenant in body | Send `POST /api/products` with body `{ "tenant_id": "other-tenant-uuid", "name": "X", "price": 1 }` | Product is created for the **logged-in** tenant only; `tenant_id` in body ignored |

**Verification:** Backend ignores any `tenant_id` sent by the client and uses only `req.tenantId` from auth middleware.

---

## 3. Performance (sanity check)

- List products / customers / invoices with 50+ rows each. Response time should stay under a few seconds. If slow, add indexes (e.g. `(tenant_id, created_at)` for invoices).

---

## 4. Manual test cases

1. **Sign up flow**
   - Sign up with email + password → redirect to “Create your shop”.
   - Enter shop name → redirect to Dashboard. Header shows shop name.
2. **Products**
   - Add product (name, price, unit). Appears in list. Search filters by name.
3. **Customers**
   - Add customer (name, optional email/phone/address). Appears in list.
4. **Invoice**
   - New invoice: select customer, date, add lines (optional product; fill description, qty, unit price). Create invoice → redirect to print view.
   - Print view: shop name, invoice number, date, bill-to, line items, total. “Print / Save as PDF” opens print dialog.
5. **Logout / login**
   - Log out → redirect to login. Log in again → same shop and data.

**Verification:** Full flow works without errors; data persists and is isolated per tenant.

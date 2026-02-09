# Strategy: Link products with IMEI to serial table

## Goal
Products that are physically serial/IMEI tracked (e.g. phones) are currently stored with `tracking_type = 'quantity'` and a single `imei` on the product row. We want to:
1. Mark them as serial type.
2. Create one row in `product_serials` per product using that IMEI so inventory and invoices use the serial table.

## Data model
- **products**: one row per SKU (e.g. "Oppo A5pro 8/128 feather blue"). Column `imei` holds one IMEI if it was entered.
- **product_serials**: one row per physical unit. `serial_number` is unique per tenant (IMEI). `product_id` links to the product.

## Strategy

### 1. Which products to convert
- All products where `imei` is non-empty. Your CSV shows these are phone SKUs with one IMEI per row.

### 2. What we do
| Step | Action |
|------|--------|
| 1 | `UPDATE products SET tracking_type = 'serial'` for every product with non-empty `imei`. |
| 2 | For each such product, `INSERT INTO product_serials (tenant_id, product_id, serial_number, status, cost_price)` with `serial_number = TRIM(products.imei)`, `status = 'available'`, `cost_price = last_purchase_price`. Skip if that `(tenant_id, serial_number)` already exists (idempotent). |
| 3 | Set `products.stock = COUNT(available serials)` for serial products so stock matches serial count. |

### 3. After migration
- **Stock**: Each product’s stock = number of rows in `product_serials` with that `product_id` and `status = 'available'`. If you had one IMEI per product, stock becomes 1 for those.
- **Adding more units**: Use purchase bills → Record with serials to add more IMEIs, or add rows to `product_serials` manually.
- **Invoices**: When selling, use the Serial (IMEI) picker; the printed invoice will show the serial numbers.

### 4. Duplicates and conflicts
- `product_serials` has unique `(tenant_id, serial_number)`. If two products shared the same IMEI, the second insert is skipped (script uses `NOT EXISTS`).
- Re-running the migration is safe: existing serials are not duplicated.

### 5. Run options
- **Apply migration**: `supabase db push` or run `00017_products_imei_to_serial.sql` in Supabase SQL editor.
- **One-off in SQL editor**: Run the same SQL from `00017_products_imei_to_serial.sql` once in the Supabase dashboard.

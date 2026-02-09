-- ============================================================
-- Seed: One purchase bill from Yuga Traders with all products
-- as line items + one full payment. Also updates product stock
-- and creates product_serials for serial products (from imei).
--
-- Supplier: Yuga Traders (0693a9e0-7db6-4281-99b4-87bd31c6a78d)
-- Tenant:   aaecbc66-804a-4da8-9e06-1a8c6538849d
-- Products: All 11 products from products CSV (same tenant)
-- ============================================================

DO $$
DECLARE
  v_tenant_id   UUID := 'aaecbc66-804a-4da8-9e06-1a8c6538849d';
  v_supplier_id UUID := '0693a9e0-7db6-4281-99b4-87bd31c6a78d';
  v_bill_id     UUID;
  v_subtotal    NUMERIC(12,2);
  v_total       NUMERIC(12,2);
  v_bill_number TEXT := 'PB-YUGA-001';
  v_bill_date   DATE := '2026-02-09';
  r             RECORD;
BEGIN
  SELECT COALESCE(SUM(price), 0) INTO v_subtotal
  FROM products
  WHERE tenant_id = v_tenant_id
    AND id IN (
      '1c7c6f34-a65f-4da4-9615-2f10f248acea',
      '49140b58-73cf-4a9e-894c-9decf63781c6',
      '6abe13f0-0287-4b35-9d19-140d0a5748f2',
      '97bc7c76-3a2a-4c1d-a62d-b5f82ca0bd8f',
      'a19e6490-3e62-4275-81d5-4d8dc9e642cb',
      'a7089485-59c3-4fe4-8121-cf8c475d1a43',
      'c835a914-eb0d-4464-a25e-077c55d06aa1',
      'd21fec1a-5964-4bc3-9d15-dc879b1ac102',
      'd45fe958-323a-4a2d-8d81-e9481d2f222a',
      'e8efbc12-d92c-4c18-9b96-5b4db232a388',
      'fbcdf101-7030-4091-8d89-0bfa5ef6eae6'
    );
  v_total := ROUND(v_subtotal * 100) / 100;

  IF EXISTS (SELECT 1 FROM purchase_bills WHERE tenant_id = v_tenant_id AND bill_number = v_bill_number) THEN
    RAISE NOTICE 'Purchase bill % already exists; skipping seed.', v_bill_number;
    RETURN;
  END IF;

  INSERT INTO purchase_bills (
    tenant_id, supplier_id, bill_number, bill_date, status, subtotal, total, amount_paid
  ) VALUES (
    v_tenant_id, v_supplier_id, v_bill_number, v_bill_date, 'recorded', v_subtotal, v_total, 0
  )
  RETURNING id INTO v_bill_id;

  INSERT INTO purchase_bill_items (purchase_bill_id, product_id, quantity, purchase_price, amount)
  SELECT v_bill_id, p.id, 1, p.price, p.price
  FROM products p
  WHERE p.tenant_id = v_tenant_id
    AND p.id IN (
      '1c7c6f34-a65f-4da4-9615-2f10f248acea',
      '49140b58-73cf-4a9e-894c-9decf63781c6',
      '6abe13f0-0287-4b35-9d19-140d0a5748f2',
      '97bc7c76-3a2a-4c1d-a62d-b5f82ca0bd8f',
      'a19e6490-3e62-4275-81d5-4d8dc9e642cb',
      'a7089485-59c3-4fe4-8121-cf8c475d1a43',
      'c835a914-eb0d-4464-a25e-077c55d06aa1',
      'd21fec1a-5964-4bc3-9d15-dc879b1ac102',
      'd45fe958-323a-4a2d-8d81-e9481d2f222a',
      'e8efbc12-d92c-4c18-9b96-5b4db232a388',
      'fbcdf101-7030-4091-8d89-0bfa5ef6eae6'
    );

  -- Update last_purchase_price and create product_serials for each line.
  -- For serial products do NOT add to stock here; stock = count(available serials), set below.
  FOR r IN
    SELECT i.id AS item_id, i.product_id, i.quantity, i.purchase_price, p.tracking_type, TRIM(p.imei) AS imei
    FROM purchase_bill_items i
    JOIN products p ON p.id = i.product_id AND p.tenant_id = v_tenant_id
    WHERE i.purchase_bill_id = v_bill_id
  LOOP
    IF r.tracking_type = 'serial' THEN
      UPDATE products
      SET last_purchase_price = r.purchase_price, updated_at = now()
      WHERE id = r.product_id AND tenant_id = v_tenant_id;
    ELSE
      UPDATE products
      SET stock = COALESCE(stock, 0) + r.quantity,
          last_purchase_price = r.purchase_price,
          updated_at = now()
      WHERE id = r.product_id AND tenant_id = v_tenant_id;
    END IF;

    IF r.tracking_type = 'serial' AND r.imei IS NOT NULL AND r.imei <> '' THEN
      INSERT INTO product_serials (tenant_id, product_id, serial_number, status, purchase_bill_item_id, cost_price, created_at)
      VALUES (v_tenant_id, r.product_id, r.imei, 'available', r.item_id, r.purchase_price, now())
      ON CONFLICT (tenant_id, serial_number) DO NOTHING;
    END IF;
  END LOOP;

  -- Serial products: stock = count of available serials (not sum of quantities)
  UPDATE products p
  SET stock = COALESCE((
    SELECT COUNT(*)::numeric FROM product_serials ps
    WHERE ps.product_id = p.id AND ps.tenant_id = p.tenant_id AND ps.status = 'available'
  ), 0),
  updated_at = now()
  WHERE p.tracking_type = 'serial' AND p.tenant_id = v_tenant_id;

  INSERT INTO purchase_payments (tenant_id, purchase_bill_id, amount, payment_method, reference, paid_at)
  VALUES (v_tenant_id, v_bill_id, v_total, 'cash', 'Seed payment', v_bill_date);

  UPDATE purchase_bills SET amount_paid = v_total WHERE id = v_bill_id;

  RAISE NOTICE 'Created purchase bill % (id %) with 11 line items, stock/serials updated, one payment of %', v_bill_number, v_bill_id, v_total;
END $$;

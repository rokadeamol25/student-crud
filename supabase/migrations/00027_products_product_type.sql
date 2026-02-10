-- Product type: optional column, options defined in Settings (feature_config.productTypeOptions)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS product_type TEXT;

COMMENT ON COLUMN products.product_type IS 'Product type/category; options defined in Settings → Product type options.';

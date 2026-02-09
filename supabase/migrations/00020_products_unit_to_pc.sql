-- Set all products' unit to 'pc'
UPDATE products
SET unit = 'pc'
WHERE unit IS DISTINCT FROM 'pc';

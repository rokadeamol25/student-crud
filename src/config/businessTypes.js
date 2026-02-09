/**
 * Feature config per business type. Used to show/hide columns and change behaviour
 * (e.g. product form fields, invoice product search method) without forking the app.
 * See docs/BUSINESS_TYPE_STRATEGY.md
 */

export const DEFAULTS = {
  // productForm and invoiceLineItems are now dynamic objects
  // keyed by DB column name → boolean. Defaults are applied at runtime
  // from the columns endpoint. These are fallback defaults for known columns.
  productForm: {},
  invoiceLineItems: {},
  invoiceProductSearch: {
    method: 'dropdown', // 'dropdown' | 'typeahead'
    searchBy: 'name',
    limit: 500,
    typeaheadDebounceMs: 300,
  },
};

/**
 * Convert a DB column_name (snake_case) to a human-readable label.
 * e.g. 'ram_storage' → 'RAM / Storage', 'hsn_sac_code' → 'HSN / SAC Code'
 */
const LABEL_OVERRIDES = {
  unit: 'Unit (e.g. pc, kg)',
  hsn_sac_code: 'HSN / SAC Code',
  tax_percent: 'Tax % (per-product override)',
  company: 'Company / Brand',
  ram_storage: 'RAM / Storage',
  imei: 'IMEI',
  color: 'Color',
};

export function columnLabel(col) {
  if (LABEL_OVERRIDES[col]) return LABEL_OVERRIDES[col];
  // fallback: snake_case → Title Case
  return col.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** Predefined RAM / Storage options for the picklist. Tenants pick from this list. */
export const RAM_STORAGE_OPTIONS = [
  '2GB/16GB',
  '2GB/32GB',
  '3GB/32GB',
  '4GB/64GB',
  '4GB/128GB',
  '6GB/64GB',
  '6GB/128GB',
  '8GB/128GB',
  '8GB/256GB',
  '12GB/256GB',
  '12GB/512GB',
  '16GB/512GB',
  '16GB/1TB',
];

/** Options for the Settings dropdown (value, label, short description). */
export const BUSINESS_TYPE_OPTIONS = [
  { value: '', label: 'Default', description: 'All product fields (Unit, HSN/SAC, Tax %). Product picker: dropdown.' },
  { value: 'retail', label: 'Retail', description: 'Product form: Name, Price, Unit only. Invoice: search products as you type.' },
  { value: 'services', label: 'Services', description: 'Same as Default (all fields, dropdown).' },
];

const BY_BUSINESS_TYPE = {
  default: {},

  // Example: retail might hide HSN/SAC and tax % on product form, use typeahead on invoices
  retail: {
    productForm: {
      unit: true,
      hsn_sac_code: false,
      tax_percent: false,
    },
    invoiceProductSearch: {
      method: 'typeahead',
      searchBy: 'name',
      limit: 20,
      typeaheadDebounceMs: 300,
    },
  },

  // Example: services might show all fields, keep dropdown
  services: {
    productForm: {
      unit: true,
      hsn_sac_code: true,
      tax_percent: true,
    },
    invoiceProductSearch: {
      method: 'dropdown',
      searchBy: 'name',
      limit: 500,
      typeaheadDebounceMs: 300,
    },
  },
};

function deepMerge(target, source) {
  const out = { ...target };
  for (const key of Object.keys(source || {})) {
    if (source[key] != null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      out[key] = deepMerge(out[key] || {}, source[key]);
    } else {
      out[key] = source[key];
    }
  }
  return out;
}

/**
 * Strip old-format camelCase keys (e.g. showUnit, showImei) from a toggle object.
 * DB column names are always lowercase snake_case — anything with uppercase is legacy.
 */
function stripLegacyKeys(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  for (const k of Object.keys(obj)) {
    if (/^[a-z][a-z0-9_]*$/.test(k)) out[k] = obj[k];
  }
  return out;
}

/**
 * Returns merged feature config: DEFAULTS → business_type preset → tenant feature_config overrides.
 * @param {string | null | undefined} businessType - From tenant.business_type (e.g. 'retail', 'services')
 * @param {object | null | undefined} featureConfig - From tenant.feature_config (per-tenant overrides)
 * @returns {typeof DEFAULTS}
 */
export function getBusinessConfig(businessType, featureConfig) {
  const key = (businessType && String(businessType).trim()) || 'default';
  const typeOverrides = BY_BUSINESS_TYPE[key] ?? BY_BUSINESS_TYPE.default ?? {};
  let config = deepMerge(JSON.parse(JSON.stringify(DEFAULTS)), typeOverrides);
  if (featureConfig && typeof featureConfig === 'object') {
    config = deepMerge(config, featureConfig);
  }
  // Strip legacy camelCase keys (showUnit, showImei, etc.) from toggle objects
  config.productForm = stripLegacyKeys(config.productForm);
  config.invoiceLineItems = stripLegacyKeys(config.invoiceLineItems);
  return config;
}

const CURRENCY_SYMBOLS = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };

/**
 * Format amount with tenant's currency. tenant can have currency_symbol or currency (code).
 */
export function formatMoney(amount, tenant) {
  const sym = tenant?.currency_symbol || (tenant?.currency && CURRENCY_SYMBOLS[tenant.currency]) || '₹';
  const n = Number(amount);
  const formatted = Number.isNaN(n) ? '0.00' : n.toFixed(2);
  return `${sym}${formatted}`;
}

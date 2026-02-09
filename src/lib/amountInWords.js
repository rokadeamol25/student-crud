/**
 * Convert a number to Indian-English words.
 * e.g. 23600 → "Rupees Twenty Three Thousand Six Hundred Only"
 */
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n) {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
}

function threeDigits(n) {
  if (n === 0) return '';
  if (n < 100) return twoDigits(n);
  return ONES[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + twoDigits(n % 100) : '');
}

/**
 * Indian numbering: Crore, Lakh, Thousand, Hundred
 * @param {number} num - The amount (can have decimals; paise will be handled)
 * @param {string} [currency='Rupees'] - Currency prefix
 * @returns {string} e.g. "Rupees Twenty Three Thousand Six Hundred Only"
 */
export function amountInWords(num, currency = 'Rupees') {
  if (num == null || isNaN(num)) return '';
  num = Math.abs(Number(num));
  if (num === 0) return `${currency} Zero Only`;

  const rupees = Math.floor(num);
  const paise = Math.round((num - rupees) * 100);

  let words = '';

  if (rupees > 0) {
    // Indian system: Crore (10^7), Lakh (10^5), Thousand (10^3), Hundred (10^2)
    const crore = Math.floor(rupees / 10000000);
    const lakh = Math.floor((rupees % 10000000) / 100000);
    const thousand = Math.floor((rupees % 100000) / 1000);
    const hundred = rupees % 1000;

    const parts = [];
    if (crore > 0) parts.push(twoDigits(crore) + ' Crore');
    if (lakh > 0) parts.push(twoDigits(lakh) + ' Lakh');
    if (thousand > 0) parts.push(twoDigits(thousand) + ' Thousand');
    if (hundred > 0) parts.push(threeDigits(hundred));
    words = parts.join(' ');
  }

  if (paise > 0) {
    const paiseWords = twoDigits(paise);
    if (words) {
      words += ' and ' + paiseWords + ' Paise';
    } else {
      words = paiseWords + ' Paise';
    }
  }

  return `${currency} ${words} Only`;
}

/**
 * Format a date string (YYYY-MM-DD) to "09 Feb 2026" format.
 */
export function formatDatePrint(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

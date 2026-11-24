import { CurrencyCode, UnitSystem } from '../types/estimate';

export const CURRENCY_META: Record<
  CurrencyCode,
  { symbol: string; name: string; subunit: string; locale: string }
> = {
  PKR: { symbol: 'Rs. ', name: 'Pakistani Rupees', subunit: 'Paisa', locale: 'en-PK' },
  USD: { symbol: '$', name: 'US Dollars', subunit: 'Cents', locale: 'en-US' },
  INR: { symbol: '₹', name: 'Indian Rupees', subunit: 'Paise', locale: 'en-IN' },
  EUR: { symbol: '€', name: 'Euros', subunit: 'Cents', locale: 'en-IE' },
  GBP: { symbol: '£', name: 'Pounds Sterling', subunit: 'Pence', locale: 'en-GB' },
  AED: { symbol: 'AED ', name: 'UAE Dirhams', subunit: 'Fils', locale: 'en-AE' },
};

export function formatCurrency(amount: number, currency: CurrencyCode = 'PKR', decimals = 2): string {
  const meta = CURRENCY_META[currency] || CURRENCY_META.PKR;
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return amount < 0 ? `-${meta.symbol}${formatted}` : `${meta.symbol}${formatted}`;
}

export function formatCompactCurrency(amount: number, currency: CurrencyCode = 'PKR'): string {
  const meta = CURRENCY_META[currency] || CURRENCY_META.PKR;
  const abs = Math.abs(amount);
  let val = '';
  if (abs >= 1_000_000) {
    val = `${(abs / 1_000_000).toFixed(2)}M`;
  } else if (abs >= 1_000) {
    val = `${(abs / 1_000).toFixed(1)}K`;
  } else {
    val = abs.toFixed(0);
  }
  return amount < 0 ? `-${meta.symbol}${val}` : `${meta.symbol}${val}`;
}

export function formatNum(val: number, decimals = 2): string {
  if (!Number.isFinite(val)) return '0.00';
  return val.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function getAreaLabel(unitSystem: UnitSystem): string {
  return unitSystem === 'imperial' ? 'sq.ft' : 'm²';
}

export function getLengthLabel(unitSystem: UnitSystem): string {
  return unitSystem === 'imperial' ? 'ft' : 'm';
}

export function getVolumeLabel(unitSystem: UnitSystem): string {
  return unitSystem === 'imperial' ? 'CFT' : 'm³';
}

export function convertArea(areaM2: number, unitSystem: UnitSystem): number {
  return unitSystem === 'imperial' ? areaM2 * 10.76391 : areaM2;
}

export function convertLength(meters: number, unitSystem: UnitSystem): number {
  return unitSystem === 'imperial' ? meters * 3.28084 : meters;
}

export function toMetricLength(displayVal: number, unitSystem: UnitSystem): number {
  return unitSystem === 'imperial' ? displayVal / 3.28084 : displayVal;
}

export function convertUnitDisplay(
  value: number,
  unit: string,
  targetSystem: UnitSystem
): { value: number; unit: string } {
  if (targetSystem === 'metric') {
    return { value, unit };
  }
  switch (unit) {
    case 'm':
      return { value: value * 3.28084, unit: 'ft' };
    case 'm²':
      return { value: value * 10.76391, unit: 'sq.ft' };
    case 'm³':
      return { value: value * 35.31467, unit: 'CFT' };
    case 'kg':
      return { value: value * 2.20462, unit: 'lb' };
    default:
      return { value, unit };
  }
}

export function convertRateDisplay(
  ratePerMetricUnit: number,
  metricUnit: string,
  targetSystem: UnitSystem
): { rate: number; unit: string } {
  if (targetSystem === 'metric') {
    return { rate: ratePerMetricUnit, unit: metricUnit };
  }
  switch (metricUnit) {
    case 'm':
      return { rate: ratePerMetricUnit / 3.28084, unit: 'ft' };
    case 'm²':
      return { rate: ratePerMetricUnit / 10.76391, unit: 'sq.ft' };
    case 'm³':
      return { rate: ratePerMetricUnit / 35.31467, unit: 'CFT' };
    case 'kg':
      return { rate: ratePerMetricUnit / 2.20462, unit: 'lb' };
    default:
      return { rate: ratePerMetricUnit, unit: metricUnit };
  }
}

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const SCALES = ['', 'Thousand', 'Million', 'Billion'];

function convertHundreds(num: number): string {
  let str = '';
  if (num >= 100) {
    str += ONES[Math.floor(num / 100)] + ' Hundred';
    num %= 100;
    if (num > 0) str += ' ';
  }
  if (num >= 20) {
    str += TENS[Math.floor(num / 10)];
    if (num % 10 > 0) str += '-' + ONES[num % 10];
  } else if (num > 0) {
    str += ONES[num];
  }
  return str.trim();
}

export function numberToWords(amount: number, currency: CurrencyCode = 'PKR'): string {
  const meta = CURRENCY_META[currency] || CURRENCY_META.PKR;
  if (!Number.isFinite(amount) || amount <= 0) return `Zero ${meta.name} Only`;

  const whole = Math.floor(amount);
  const cents = Math.round((amount - whole) * 100);

  if (whole === 0) {
    return `${convertHundreds(cents)} ${meta.subunit} Only`;
  }

  const parts: string[] = [];
  let remaining = whole;
  let scaleIdx = 0;

  while (remaining > 0) {
    const chunk = remaining % 1000;
    if (chunk > 0) {
      const chunkWords = convertHundreds(chunk);
      parts.unshift(SCALES[scaleIdx] ? `${chunkWords} ${SCALES[scaleIdx]}` : chunkWords);
    }
    remaining = Math.floor(remaining / 1000);
    scaleIdx += 1;
  }

  let result = `${parts.join(' ')} ${meta.name}`;
  if (cents > 0) {
    result += ` and ${convertHundreds(cents)} ${meta.subunit}`;
  }
  return `${result} Only`;
}

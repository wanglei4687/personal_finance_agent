type CurrencyFormatOptions = {
  locale?: string;
  currency?: string;
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
};

export function formatCurrency(
  amount: number,
  options: CurrencyFormatOptions = {},
): string {
  const {
    locale = 'zh-CN',
    currency = 'CNY',
    maximumFractionDigits = 2,
    minimumFractionDigits,
  } = options;

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits,
    ...(minimumFractionDigits === undefined ? {} : { minimumFractionDigits }),
  }).format(amount);
}

export function calculateRatio(
  numerator: number,
  denominator: number,
): number | null;
export function calculateRatio(
  numerator: number,
  denominator: number,
  fallback: number,
): number;
export function calculateRatio(
  numerator: number,
  denominator: number,
  fallback: number | null = null,
): number | null {
  if (denominator <= 0) {
    return fallback;
  }

  return Number((numerator / denominator).toFixed(4));
}

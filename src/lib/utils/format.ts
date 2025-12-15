import { formatUnits, parseUnits } from 'viem';

/**
 * =============================================
 * PRICE CONVERSION UTILITIES (using viem)
 * =============================================
 *
 * Convention:
 * - Database stores prices in CENTS (2 decimals, stored as integer)
 * - USDC has 6 decimals on-chain
 * - All conversions use viem's parseUnits/formatUnits
 */

// Decimals
const CENTS_DECIMALS = 2;
const USDC_DECIMALS = 6;

/** Convert cents (integer) to dollars string using viem */
export function centsToDollars(cents: number): string {
  return formatUnits(BigInt(cents), CENTS_DECIMALS);
}

/** Convert dollars string to cents (integer) using viem */
export function dollarsToCents(dollars: string | number): number {
  const dollarStr = typeof dollars === 'number' ? dollars.toString() : dollars;
  return Number(parseUnits(dollarStr, CENTS_DECIMALS));
}

/** Convert cents to USDC atomic units (6 decimals) */
export function centsToUsdcUnits(cents: number): bigint {
  // First convert cents to dollars string, then parse as USDC
  const dollars = formatUnits(BigInt(cents), CENTS_DECIMALS);
  return parseUnits(dollars, USDC_DECIMALS);
}

/** Convert USDC atomic units to cents */
export function usdcUnitsToCents(units: bigint): number {
  // Format as dollars string, then parse as cents
  const dollars = formatUnits(units, USDC_DECIMALS);
  return Number(parseUnits(dollars, CENTS_DECIMALS));
}

/** Convert cents to USDC amount string (for display/API) */
export function centsToUsdcString(cents: number): string {
  return formatUnits(BigInt(cents), CENTS_DECIMALS);
}

/** Convert USDC atomic units (6 decimals) to dollars number */
export function usdcUnitsToDollars(units: bigint | string | number): number {
  const unitsBigInt = typeof units === 'bigint' ? units : BigInt(units);
  return Number(formatUnits(unitsBigInt, USDC_DECIMALS));
}

/**
 * Calculate projected earnings at a given call volume
 * @param priceCents - Price per call in cents
 * @param callCount - Number of calls
 * @returns Total earnings in cents
 */
export function calculateEarnings(priceCents: number, callCount: number): number {
  return priceCents * callCount;
}

/**
 * Format a number as currency (USD)
 */
export function formatCurrency(amount: number, decimals = 2): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

/**
 * Format cents as USDC display string (e.g., 1 cent -> "$0.01")
 */
export function formatUsdc(amountCents: number): string {
  const dollars = Number(centsToDollars(amountCents));
  // Show more decimals for small amounts
  if (dollars < 0.01) {
    return `$${dollars.toFixed(4)}`;
  }
  return `$${dollars.toFixed(2)}`;
}

/**
 * Shorten an Ethereum address
 */
export function shortenAddress(address: string, chars = 4): string {
  if (!address) return '';
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Format a large number with K/M/B suffix
 */
export function formatCompactNumber(num: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(num);
}

/**
 * Format a date as relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const then = new Date(date);
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return then.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format a number with thousands separators
 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num);
}

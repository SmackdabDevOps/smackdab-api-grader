

/**
 * test.ts — Deterministic utilities intended for TDE v2 unit testing
 *
 * All functions are **spec-defined but unimplemented** (throw Not implemented),
 * so your Test Development Engineer agent can follow RED → GREEN → REFACTOR.
 *
 * Guidelines for implementers (what tests should assert):
 *  - Pure functions must be deterministic for the same inputs.
 *  - Monetary values use integer cents to avoid FP errors.
 *  - When rounding is involved, behavior is explicitly defined.
 *  - Time-sensitive code must accept an injected clock where noted.
 */

// -----------------------------
// Money types & helpers
// -----------------------------

export type Currency = 'USD' | 'EUR' | 'GBP';

export interface Money {
  /** integer number of the smallest currency unit (cents/pence) */
  cents: number;
  currency: Currency;
}

/**
 * Parse a money string into {cents, currency}.
 *
 * Supported examples (en-US unless otherwise noted):
 *  - "$1,234.56" → { cents: 123456, currency: 'USD' }
 *  - "USD 12.34"  → { cents: 1234,   currency: 'USD' }
 *  - "12.34 GBP"  → { cents: 1234,   currency: 'GBP' }
 *  - "€99.95"     → { cents: 9995,   currency: 'EUR' }
 *
 * Rules:
 *  - Only '.' as decimal separator; ',' may appear as thousands separator.
 *  - Exactly two fraction digits are allowed; otherwise throw.
 *  - Currency defaults to USD if not inferable from symbol/code.
 *  - Reject negative amounts (use a separate path for refunds/credits).
 */
export function parseMoney(input: string): Money {
  // Input validation
  if (!input || input.trim() === '') {
    throw new Error('Empty input not allowed');
  }

  if (input.includes('-')) {
    throw new Error('Negative amounts not allowed');
  }

  let cleanedInput = input.trim();
  let currency: Currency = 'USD'; // Default currency

  // Currency symbol/code mapping
  const currencyPatterns: Array<{
    test: (s: string) => boolean;
    currency: Currency;
    clean: (s: string) => string;
  }> = [
    // Symbol prefixes
    { test: s => s.startsWith('$'), currency: 'USD', clean: s => s.substring(1).trim() },
    { test: s => s.startsWith('£'), currency: 'GBP', clean: s => s.substring(1).trim() },
    { test: s => s.startsWith('€'), currency: 'EUR', clean: s => s.substring(1).trim() },
    // Code prefixes
    { test: s => s.startsWith('USD '), currency: 'USD', clean: s => s.substring(4).trim() },
    { test: s => s.startsWith('EUR '), currency: 'EUR', clean: s => s.substring(4).trim() },
    { test: s => s.startsWith('GBP '), currency: 'GBP', clean: s => s.substring(4).trim() },
    // Code suffixes
    { test: s => s.endsWith(' USD'), currency: 'USD', clean: s => s.slice(0, -4).trim() },
    { test: s => s.endsWith(' EUR'), currency: 'EUR', clean: s => s.slice(0, -4).trim() },
    { test: s => s.endsWith(' GBP'), currency: 'GBP', clean: s => s.slice(0, -4).trim() },
  ];

  // Apply currency detection and cleaning
  for (const pattern of currencyPatterns) {
    if (pattern.test(cleanedInput)) {
      currency = pattern.currency;
      cleanedInput = pattern.clean(cleanedInput);
      break;
    }
  }

  // Remove thousands separators
  const numericString = cleanedInput.replace(/,/g, '');

  // Validate decimal format
  const decimalParts = numericString.split('.');
  if (decimalParts.length > 2) {
    throw new Error('Invalid decimal format');
  }

  // Enforce exactly 2 decimal places if decimals present
  if (decimalParts.length === 2 && decimalParts[1].length !== 2) {
    throw new Error('Exactly two decimal places required');
  }

  // Parse and validate numeric value
  const numericValue = parseFloat(numericString);
  if (isNaN(numericValue)) {
    throw new Error('Invalid number format');
  }

  // Convert to cents (using Math.round to handle floating point precision)
  const cents = Math.round(numericValue * 100);

  return { cents, currency };
}

/**
 * Add two Money values. Currencies must match exactly.
 *
 * Examples:
 *  - addMoney({100, 'USD'}, {250, 'USD'}) → {350, 'USD'}
 *  - Mixing currencies throws an error.
 */
export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error('Currency mismatch');
  }
  return { cents: a.cents + b.cents, currency: a.currency };
}

/**
 * Compute tax amount for a subtotal using a percent rate.
 *
 * @param subtotal Money in integer cents
 * @param ratePct e.g., 8 for 8%
 * @param rounding one of:
 *   - 'nearest' (half away from zero)
 *   - 'up'      (ceil to next cent)
 *   - 'down'    (floor to previous cent)
 * @returns tax Money (same currency as subtotal)
 */
export function computeTax(
  subtotal: Money,
  ratePct: number,
  rounding: 'nearest' | 'up' | 'down' = 'nearest'
): Money {
  const taxAmount = (subtotal.cents * ratePct) / 100;
  
  let taxCents: number;
  if (rounding === 'up') {
    taxCents = Math.ceil(taxAmount);
  } else if (rounding === 'down') {
    taxCents = Math.floor(taxAmount);
  } else {
    taxCents = Math.round(taxAmount);
  }
  
  return { cents: taxCents, currency: subtotal.currency };
}

/**
 * Return total = subtotal + tax (using same rounding rules as computeTax).
 */
export function totalWithTax(
  subtotal: Money,
  ratePct: number,
  rounding: 'nearest' | 'up' | 'down' = 'nearest'
): Money {
  const tax = computeTax(subtotal, ratePct, rounding);
  return addMoney(subtotal, tax);
}

// -----------------------------
// String utilities
// -----------------------------

/**
 * Slugify a string for URLs.
 * Rules:
 *  - Lowercase, Unicode NFKD, strip diacritics, remove emoji.
 *  - Replace any non [a-z0-9] with '-'.
 *  - Collapse multiple '-' and trim leading/trailing '-'.
 *  - Truncate to maxLength (default 80) without cutting inside a code point.
 */
export function slugify(input: string, maxLength = 80): string {
  if (!input || input.trim() === '') {
    return '';
  }

  // Normalize to NFKD and remove diacritics
  let result = input.normalize('NFKD').replace(/[\u0300-\u036F]/g, '');
  
  // Convert to lowercase
  result = result.toLowerCase();
  
  // Remove emoji and special Unicode characters
  result = result.replace(/[\u{1F600}-\u{1F6FF}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '');
  
  // Replace any non [a-z0-9] with '-'
  result = result.replace(/[^a-z0-9]/g, '-');
  
  // Collapse multiple '-' and trim leading/trailing '-'
  result = result.replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  
  // Truncate to maxLength
  if (result.length > maxLength) {
    result = result.substring(0, maxLength);
  }
  
  return result;
}

/**
 * Normalize email addresses.
 * Rules:
 *  - Always lowercase the domain.
 *  - For Gmail domains ("gmail.com" or "googlemail.com"):
 *      • remove dots in the local part
 *      • remove "+tag" suffix
 *    Example: "First.Last+promo@gmail.com" → "firstlast@gmail.com"
 *  - For all other domains: leave local part intact, just lowercase domain.
 */
export function normalizeEmail(email: string): string {
  const [localPart, domainPart] = email.split('@');
  const domain = domainPart.toLowerCase();
  
  // Handle Gmail domains (gmail.com and googlemail.com)
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    // Remove dots in the local part and lowercase
    let normalizedLocal = localPart.toLowerCase().replace(/\./g, '');
    
    // Remove "+tag" suffix
    const plusIndex = normalizedLocal.indexOf('+');
    if (plusIndex !== -1) {
      normalizedLocal = normalizedLocal.substring(0, plusIndex);
    }
    
    return `${normalizedLocal}@gmail.com`;
  }
  
  // For all other domains: leave local part intact, just lowercase domain
  return `${localPart}@${domain}`;
}

// -----------------------------
// Collections & pagination
// -----------------------------

export interface Page<T> {
  items: T[];
  page: number;      // 1-based
  perPage: number;   // > 0
  totalItems: number;
  totalPages: number; // Math.ceil(totalItems / perPage)
  hasPrev: boolean;
  hasNext: boolean;
}

/**
 * Pure in-memory paginator.
 * Rules:
 *  - page is 1-based; perPage must be >= 1.
 *  - If page exceeds totalPages, return an empty items array and proper flags.
 */
export function paginate<T>(items: readonly T[], page: number, perPage: number): Page<T> {
  const totalItems = items.length;
  const totalPages = Math.ceil(totalItems / perPage);
  
  // Calculate start and end indices
  const startIndex = (page - 1) * perPage;
  const endIndex = Math.min(startIndex + perPage, totalItems);
  
  // Get items for current page
  const pageItems = page > totalPages ? [] : items.slice(startIndex, endIndex);
  
  return {
    items: pageItems,
    page,
    perPage,
    totalItems,
    totalPages: totalPages || 0,
    hasPrev: page > 1,
    hasNext: page < totalPages
  };
}

// -----------------------------
// Time-sensitive: token bucket with injectable clock
// -----------------------------

export interface Clock { nowMs(): number }

/**
 * Simple token bucket rate limiter.
 *  - capacity: max tokens in the bucket (integer > 0)
 *  - refillPerSecond: tokens added per second (float ≥ 0), fractional OK
 *  - clock: defaults to system clock but **tests should inject** a fake clock
 *
 * Behavior:
 *  - Bucket starts full.
 *  - Calling tryRemove(n) removes n tokens if available and returns true; else false.
 *  - Tokens refill continuously based on elapsed time since last mutation, but never exceed capacity.
 */
export class TokenBucket {
  private currentTokens: number;
  private lastRefillTime: number;
  
  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    private readonly clock: Clock = { nowMs: () => Date.now() }
  ) {
    // Bucket starts full
    this.currentTokens = capacity;
    this.lastRefillTime = clock.nowMs();
  }

  /** Current tokens (rounded down to nearest 1/1000 for determinism) */
  public tokens(): number {
    this.refillTokens();
    return Math.round(this.currentTokens * 1000) / 1000;
  }

  /** Attempt to remove n tokens, returning true on success */
  public tryRemove(n: number): boolean {
    this.refillTokens();
    
    if (this.currentTokens >= n) {
      this.currentTokens -= n;
      return true;
    }
    
    return false;
  }
  
  private refillTokens(): void {
    const now = this.clock.nowMs();
    const elapsed = now - this.lastRefillTime;
    
    if (elapsed > 0) {
      const tokensToAdd = (elapsed / 1000) * this.refillPerSecond;
      this.currentTokens = Math.min(this.capacity, this.currentTokens + tokensToAdd);
      this.lastRefillTime = now;
    }
  }
}

// -----------------------------
// Version for sanity checks
// -----------------------------

export const __version__ = '0.1.0-spec-only';
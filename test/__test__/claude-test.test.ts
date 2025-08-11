import { parseMoney, addMoney, computeTax, slugify, TokenBucket, normalizeEmail, paginate } from '../../.claude/test';

describe('parseMoney', () => {
  test('should parse $100.00 to USD cents', () => {
    const result = parseMoney('$100.00');
    expect(result).toEqual({ cents: 10000, currency: 'USD' });
  });

  test('should parse USD 12.34 to USD cents', () => {
    const result = parseMoney('USD 12.34');
    expect(result).toEqual({ cents: 1234, currency: 'USD' });
  });

  test('should parse EUR prefix format', () => {
    const result = parseMoney('EUR 99.95');
    expect(result).toEqual({ cents: 9995, currency: 'EUR' });
  });
});

describe('addMoney', () => {
  test('should add two USD amounts', () => {
    const result = addMoney({ cents: 100, currency: 'USD' }, { cents: 250, currency: 'USD' });
    expect(result).toEqual({ cents: 350, currency: 'USD' });
  });
});

describe('computeTax', () => {
  test('should compute tax with nearest rounding', () => {
    const subtotal = { cents: 10000, currency: 'USD' as const }; // $100.00
    const result = computeTax(subtotal, 8.25); // 8.25% tax
    expect(result).toEqual({ cents: 825, currency: 'USD' }); // $8.25
  });
});

describe('slugify', () => {
  test('should convert string to URL-safe slug', () => {
    const result = slugify('Hello World! How are you?');
    expect(result).toBe('hello-world-how-are-you');
  });
});

describe('TokenBucket', () => {
  test('should initialize with full capacity using mock clock', () => {
    let currentTime = 0;
    const mockClock = { nowMs: () => currentTime };
    
    const bucket = new TokenBucket(10, 2, mockClock);
    expect(bucket.tokens()).toBe(10);
  });
});

describe('normalizeEmail', () => {
  test('should normalize Gmail address with dots and plus suffix', () => {
    const result = normalizeEmail('First.Last+promo@gmail.com');
    expect(result).toBe('firstlast@gmail.com');
  });
});

describe('paginate', () => {
  test('should paginate array with proper metadata', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = paginate(items, 2, 3); // page 2, 3 per page
    expect(result).toEqual({
      items: [4, 5, 6],
      page: 2,
      perPage: 3,
      totalItems: 10,
      totalPages: 4,
      hasPrev: true,
      hasNext: true
    });
  });
});
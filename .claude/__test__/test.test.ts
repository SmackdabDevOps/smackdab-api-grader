import { parseMoney, addMoney, computeTax, slugify, normalizeEmail, paginate, TokenBucket } from '../test';

describe('parseMoney', () => {
  test('should parse $100.00 to USD cents', () => {
    const result = parseMoney('$100.00');
    expect(result).toEqual({ cents: 10000, currency: 'USD' });
  });

  test('should reject negative amounts', () => {
    expect(() => parseMoney('$-100.00')).toThrow('Negative amounts not allowed');
  });
});

describe('addMoney', () => {
  test('should add two USD amounts correctly', () => {
    const a = { cents: 100, currency: 'USD' as const };
    const b = { cents: 250, currency: 'USD' as const };
    const result = addMoney(a, b);
    expect(result).toEqual({ cents: 350, currency: 'USD' });
  });

  test('should throw error when currencies do not match', () => {
    const a = { cents: 100, currency: 'USD' as const };
    const b = { cents: 250, currency: 'EUR' as const };
    expect(() => addMoney(a, b)).toThrow('Currency mismatch');
  });
});

describe('computeTax', () => {
  test('should compute tax with nearest rounding', () => {
    const subtotal = { cents: 1000, currency: 'USD' as const };
    const result = computeTax(subtotal, 8.25, 'nearest');
    expect(result).toEqual({ cents: 83, currency: 'USD' });
  });

  test('should compute tax with up rounding', () => {
    const subtotal = { cents: 1000, currency: 'USD' as const };
    const result = computeTax(subtotal, 8.24, 'up');
    expect(result).toEqual({ cents: 83, currency: 'USD' });
  });
});

describe('slugify', () => {
  test('should convert simple text to slug', () => {
    const result = slugify('Hello World!');
    expect(result).toBe('hello-world');
  });
});

describe('normalizeEmail', () => {
  test('should normalize Gmail address with dots and plus', () => {
    const result = normalizeEmail('First.Last+promo@gmail.com');
    expect(result).toBe('firstlast@gmail.com');
  });
});

describe('paginate', () => {
  test('should paginate array correctly', () => {
    const items = [1, 2, 3, 4, 5];
    const result = paginate(items, 1, 2);
    expect(result).toEqual({
      items: [1, 2],
      page: 1,
      perPage: 2,
      totalItems: 5,
      totalPages: 3,
      hasPrev: false,
      hasNext: true
    });
  });
});

describe('TokenBucket', () => {
  test('should start with full capacity', () => {
    const mockClock = { nowMs: () => 1000 };
    const bucket = new TokenBucket(10, 1.0, mockClock);
    expect(bucket.tokens()).toBe(10);
  });
});
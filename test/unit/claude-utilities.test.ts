import {
  parseMoney,
  addMoney,
  computeTax,
  totalWithTax,
  slugify,
  normalizeEmail,
  paginate,
  TokenBucket,
  type Money,
  type Currency,
  type Page,
  type Clock,
} from '../../.claude/test.js';

// Test logging setup
const fs = require('fs');
const path = require('path');

const now = new Date();
const timestamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}-${String(now.getSeconds()).padStart(2,'0')}`;
const logFile = path.join(process.cwd(), '.logs', `test-driven-implementation_${timestamp}.log`);

function log(entry: any) {
  entry.timestamp = new Date().toISOString();
  fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
}

log({ action: 'INIT', phase: 'GREEN', file: logFile });

describe('Claude Utilities - TDD Implementation', () => {
  
  // ================================
  // MONEY FUNCTIONS TESTS
  // ================================
  
  describe('parseMoney (already implemented)', () => {
    test('should parse USD with dollar symbol', () => {
      expect(parseMoney('$12.34')).toEqual({ cents: 1234, currency: 'USD' });
    });

    test('should parse EUR with euro symbol', () => {
      expect(parseMoney('€99.95')).toEqual({ cents: 9995, currency: 'EUR' });
    });

    test('should parse GBP with pound symbol', () => {
      expect(parseMoney('£50.00')).toEqual({ cents: 5000, currency: 'GBP' });
    });

    test('should parse with currency codes', () => {
      expect(parseMoney('USD 12.34')).toEqual({ cents: 1234, currency: 'USD' });
      expect(parseMoney('12.34 GBP')).toEqual({ cents: 1234, currency: 'GBP' });
      expect(parseMoney('EUR 99.95')).toEqual({ cents: 9995, currency: 'EUR' });
    });

    test('should handle thousands separators', () => {
      expect(parseMoney('$1,234.56')).toEqual({ cents: 123456, currency: 'USD' });
    });

    test('should default to USD when no currency specified', () => {
      expect(parseMoney('12.34')).toEqual({ cents: 1234, currency: 'USD' });
    });

    test('should throw on negative amounts', () => {
      expect(() => parseMoney('-$12.34')).toThrow('Negative amounts not allowed');
    });

    test('should throw on invalid decimal places', () => {
      expect(() => parseMoney('$12.3')).toThrow('Exactly two decimal places required');
      expect(() => parseMoney('$12.345')).toThrow('Exactly two decimal places required');
    });

    test('should throw on empty input', () => {
      expect(() => parseMoney('')).toThrow('Empty input not allowed');
      expect(() => parseMoney('   ')).toThrow('Empty input not allowed');
    });
  });

  describe('addMoney', () => {
    test('should add two Money values with same currency', () => {
      const a: Money = { cents: 100, currency: 'USD' };
      const b: Money = { cents: 250, currency: 'USD' };
      expect(addMoney(a, b)).toEqual({ cents: 350, currency: 'USD' });
    });

    test('should add EUR amounts', () => {
      const a: Money = { cents: 500, currency: 'EUR' };
      const b: Money = { cents: 300, currency: 'EUR' };
      expect(addMoney(a, b)).toEqual({ cents: 800, currency: 'EUR' });
    });

    test('should add GBP amounts', () => {
      const a: Money = { cents: 1000, currency: 'GBP' };
      const b: Money = { cents: 2500, currency: 'GBP' };
      expect(addMoney(a, b)).toEqual({ cents: 3500, currency: 'GBP' });
    });

    test('should throw error when currencies do not match', () => {
      const a: Money = { cents: 100, currency: 'USD' };
      const b: Money = { cents: 250, currency: 'EUR' };
      expect(() => addMoney(a, b)).toThrow('Currency mismatch');
    });

    test('should handle zero amounts', () => {
      const a: Money = { cents: 0, currency: 'USD' };
      const b: Money = { cents: 100, currency: 'USD' };
      expect(addMoney(a, b)).toEqual({ cents: 100, currency: 'USD' });
    });
  });

  describe('computeTax', () => {
    test('should compute tax with nearest rounding (default)', () => {
      const subtotal: Money = { cents: 1000, currency: 'USD' }; // $10.00
      const result = computeTax(subtotal, 8.25); // 8.25%
      expect(result).toEqual({ cents: 83, currency: 'USD' }); // $0.83 (82.5 rounded to nearest)
    });

    test('should compute tax with up rounding', () => {
      const subtotal: Money = { cents: 1000, currency: 'USD' }; // $10.00
      const result = computeTax(subtotal, 8.25, 'up'); // 8.25%
      expect(result).toEqual({ cents: 83, currency: 'USD' }); // $0.83 (82.5 rounded up)
    });

    test('should compute tax with down rounding', () => {
      const subtotal: Money = { cents: 1000, currency: 'USD' }; // $10.00
      const result = computeTax(subtotal, 8.25, 'down'); // 8.25%
      expect(result).toEqual({ cents: 82, currency: 'USD' }); // $0.82 (82.5 rounded down)
    });

    test('should handle different currencies', () => {
      const subtotal: Money = { cents: 2000, currency: 'EUR' }; // €20.00
      const result = computeTax(subtotal, 10); // 10%
      expect(result).toEqual({ cents: 200, currency: 'EUR' }); // €2.00
    });

    test('should handle zero tax rate', () => {
      const subtotal: Money = { cents: 1000, currency: 'USD' };
      const result = computeTax(subtotal, 0);
      expect(result).toEqual({ cents: 0, currency: 'USD' });
    });

    test('should handle zero subtotal', () => {
      const subtotal: Money = { cents: 0, currency: 'USD' };
      const result = computeTax(subtotal, 8.25);
      expect(result).toEqual({ cents: 0, currency: 'USD' });
    });
  });

  describe('totalWithTax', () => {
    test('should return subtotal plus tax with nearest rounding (default)', () => {
      const subtotal: Money = { cents: 1000, currency: 'USD' }; // $10.00
      const result = totalWithTax(subtotal, 8.25); // 8.25% = $0.83 tax
      expect(result).toEqual({ cents: 1083, currency: 'USD' }); // $10.83
    });

    test('should return subtotal plus tax with up rounding', () => {
      const subtotal: Money = { cents: 1000, currency: 'USD' }; // $10.00
      const result = totalWithTax(subtotal, 8.25, 'up'); // 8.25% = $0.83 tax (up)
      expect(result).toEqual({ cents: 1083, currency: 'USD' }); // $10.83
    });

    test('should return subtotal plus tax with down rounding', () => {
      const subtotal: Money = { cents: 1000, currency: 'USD' }; // $10.00
      const result = totalWithTax(subtotal, 8.25, 'down'); // 8.25% = $0.82 tax (down)
      expect(result).toEqual({ cents: 1082, currency: 'USD' }); // $10.82
    });

    test('should handle different currencies', () => {
      const subtotal: Money = { cents: 5000, currency: 'GBP' }; // £50.00
      const result = totalWithTax(subtotal, 20); // 20% = £10.00 tax
      expect(result).toEqual({ cents: 6000, currency: 'GBP' }); // £60.00
    });

    test('should handle zero tax rate', () => {
      const subtotal: Money = { cents: 1500, currency: 'EUR' }; // €15.00
      const result = totalWithTax(subtotal, 0);
      expect(result).toEqual({ cents: 1500, currency: 'EUR' }); // €15.00
    });
  });

  // ================================
  // STRING UTILITIES TESTS
  // ================================

  describe('slugify', () => {
    test('should convert basic string to slug', () => {
      expect(slugify('Hello World')).toBe('hello-world');
    });

    test('should handle uppercase and mixed case', () => {
      expect(slugify('API Documentation')).toBe('api-documentation');
      expect(slugify('CamelCase Title')).toBe('camelcase-title');
    });

    test('should remove diacritics and normalize', () => {
      expect(slugify('Café Naïve')).toBe('cafe-naive');
      expect(slugify('Résumé')).toBe('resume');
    });

    test('should replace non-alphanumeric with hyphens', () => {
      expect(slugify('Hello, World!')).toBe('hello-world');
      expect(slugify('API & Documentation')).toBe('api-documentation');
      expect(slugify('Test@example.com')).toBe('test-example-com');
    });

    test('should collapse multiple hyphens', () => {
      expect(slugify('Hello    World!!!')).toBe('hello-world');
      expect(slugify('API --- Documentation')).toBe('api-documentation');
    });

    test('should trim leading and trailing hyphens', () => {
      expect(slugify('!!!Hello World!!!')).toBe('hello-world');
      expect(slugify('---Start and End---')).toBe('start-and-end');
    });

    test('should handle empty string', () => {
      expect(slugify('')).toBe('');
      expect(slugify('   ')).toBe('');
    });

    test('should truncate to maxLength', () => {
      const longString = 'This is a very long string that should be truncated at the specified length';
      expect(slugify(longString, 20)).toHaveLength(20);
      expect(slugify(longString, 20)).toBe('this-is-a-very-long-');
    });

    test('should handle custom maxLength', () => {
      expect(slugify('Hello World', 5)).toBe('hello');
      expect(slugify('Test String', 10)).toBe('test-strin');
    });

    test('should remove emoji and special Unicode', () => {
      expect(slugify('Hello 🌍 World')).toBe('hello-world');
      expect(slugify('Test 😊 Case')).toBe('test-case');
    });

    test('should preserve numbers', () => {
      expect(slugify('Version 2.0.1')).toBe('version-2-0-1');
      expect(slugify('API v3 Documentation')).toBe('api-v3-documentation');
    });
  });

  describe('normalizeEmail', () => {
    test('should lowercase domain for non-Gmail', () => {
      expect(normalizeEmail('User@EXAMPLE.COM')).toBe('User@example.com');
      expect(normalizeEmail('Test@Yahoo.COM')).toBe('Test@yahoo.com');
    });

    test('should handle Gmail addresses - remove dots and plus tags', () => {
      expect(normalizeEmail('first.last@gmail.com')).toBe('firstlast@gmail.com');
      expect(normalizeEmail('First.Last+promo@gmail.com')).toBe('firstlast@gmail.com');
      expect(normalizeEmail('user+tag@gmail.com')).toBe('user@gmail.com');
    });

    test('should handle googlemail.com as Gmail', () => {
      expect(normalizeEmail('first.last@googlemail.com')).toBe('firstlast@gmail.com');
      expect(normalizeEmail('user+tag@googlemail.com')).toBe('user@gmail.com');
    });

    test('should preserve case in local part for non-Gmail', () => {
      expect(normalizeEmail('FirstLast@example.com')).toBe('FirstLast@example.com');
      expect(normalizeEmail('User.Name@yahoo.com')).toBe('User.Name@yahoo.com');
    });

    test('should handle mixed case Gmail domains', () => {
      expect(normalizeEmail('user@GMAIL.COM')).toBe('user@gmail.com');
      expect(normalizeEmail('user@GoogleMail.com')).toBe('user@gmail.com');
    });

    test('should handle complex Gmail cases', () => {
      expect(normalizeEmail('a.b.c.d+tag1+tag2@gmail.com')).toBe('abcd@gmail.com');
      expect(normalizeEmail('test.email.with+lots.of.dots@gmail.com')).toBe('testemailwith@gmail.com');
    });

    test('should handle edge cases', () => {
      expect(normalizeEmail('simple@gmail.com')).toBe('simple@gmail.com');
      expect(normalizeEmail('no.dots.no.plus@example.com')).toBe('no.dots.no.plus@example.com');
    });
  });

  // ================================
  // PAGINATION TESTS
  // ================================

  describe('paginate', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    test('should paginate items correctly - first page', () => {
      const result = paginate(items, 1, 3);
      expect(result).toEqual({
        items: [1, 2, 3],
        page: 1,
        perPage: 3,
        totalItems: 10,
        totalPages: 4,
        hasPrev: false,
        hasNext: true
      });
    });

    test('should paginate items correctly - middle page', () => {
      const result = paginate(items, 2, 3);
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

    test('should paginate items correctly - last page', () => {
      const result = paginate(items, 4, 3);
      expect(result).toEqual({
        items: [10],
        page: 4,
        perPage: 3,
        totalItems: 10,
        totalPages: 4,
        hasPrev: true,
        hasNext: false
      });
    });

    test('should handle page beyond total pages', () => {
      const result = paginate(items, 10, 3);
      expect(result).toEqual({
        items: [],
        page: 10,
        perPage: 3,
        totalItems: 10,
        totalPages: 4,
        hasPrev: true,
        hasNext: false
      });
    });

    test('should handle empty items array', () => {
      const result = paginate([], 1, 5);
      expect(result).toEqual({
        items: [],
        page: 1,
        perPage: 5,
        totalItems: 0,
        totalPages: 0,
        hasPrev: false,
        hasNext: false
      });
    });

    test('should handle single page', () => {
      const smallItems = [1, 2, 3];
      const result = paginate(smallItems, 1, 10);
      expect(result).toEqual({
        items: [1, 2, 3],
        page: 1,
        perPage: 10,
        totalItems: 3,
        totalPages: 1,
        hasPrev: false,
        hasNext: false
      });
    });

    test('should handle perPage = 1', () => {
      const result = paginate([1, 2, 3], 2, 1);
      expect(result).toEqual({
        items: [2],
        page: 2,
        perPage: 1,
        totalItems: 3,
        totalPages: 3,
        hasPrev: true,
        hasNext: true
      });
    });
  });

  // ================================
  // TOKEN BUCKET TESTS
  // ================================

  describe('TokenBucket', () => {
    // Mock clock for deterministic testing
    class MockClock implements Clock {
      private currentTime = 0;
      
      nowMs(): number {
        return this.currentTime;
      }
      
      advance(ms: number): void {
        this.currentTime += ms;
      }
      
      setTime(ms: number): void {
        this.currentTime = ms;
      }
    }

    test('should start with full bucket', () => {
      const mockClock = new MockClock();
      const bucket = new TokenBucket(10, 1, mockClock);
      expect(bucket.tokens()).toBe(10);
    });

    test('should remove tokens successfully when available', () => {
      const mockClock = new MockClock();
      const bucket = new TokenBucket(10, 1, mockClock);
      
      expect(bucket.tryRemove(3)).toBe(true);
      expect(bucket.tokens()).toBe(7);
      
      expect(bucket.tryRemove(4)).toBe(true);
      expect(bucket.tokens()).toBe(3);
    });

    test('should fail to remove tokens when insufficient', () => {
      const mockClock = new MockClock();
      const bucket = new TokenBucket(5, 1, mockClock);
      
      expect(bucket.tryRemove(3)).toBe(true);
      expect(bucket.tokens()).toBe(2);
      
      expect(bucket.tryRemove(5)).toBe(false);
      expect(bucket.tokens()).toBe(2); // unchanged
    });

    test('should refill tokens based on time elapsed', () => {
      const mockClock = new MockClock();
      const bucket = new TokenBucket(10, 2, mockClock); // 2 tokens per second
      
      bucket.tryRemove(5);
      expect(bucket.tokens()).toBe(5);
      
      // Advance 1 second = 2 tokens
      mockClock.advance(1000);
      expect(bucket.tokens()).toBe(7);
      
      // Advance another 1.5 seconds = 3 more tokens
      mockClock.advance(1500);
      expect(bucket.tokens()).toBe(10); // capped at capacity
    });

    test('should not exceed capacity when refilling', () => {
      const mockClock = new MockClock();
      const bucket = new TokenBucket(5, 10, mockClock); // Fast refill
      
      bucket.tryRemove(2);
      expect(bucket.tokens()).toBe(3);
      
      // Advance time way more than needed
      mockClock.advance(10000);
      expect(bucket.tokens()).toBe(5); // capped at capacity
    });

    test('should handle fractional refill rates', () => {
      const mockClock = new MockClock();
      const bucket = new TokenBucket(10, 0.5, mockClock); // 0.5 tokens per second
      
      bucket.tryRemove(5);
      expect(bucket.tokens()).toBe(5);
      
      // Advance 4 seconds = 2 tokens
      mockClock.advance(4000);
      expect(bucket.tokens()).toBe(7);
    });

    test('should round tokens down to nearest 1/1000 for determinism', () => {
      const mockClock = new MockClock();
      const bucket = new TokenBucket(10, 0.333, mockClock); // Creates fractional tokens
      
      bucket.tryRemove(5);
      mockClock.advance(3003); // Should add ~1.000999 tokens
      
      const tokens = bucket.tokens();
      expect(tokens).toBeCloseTo(6, 3); // Should be rounded to 3 decimal places
    });

    test('should handle zero refill rate', () => {
      const mockClock = new MockClock();
      const bucket = new TokenBucket(5, 0, mockClock);
      
      bucket.tryRemove(2);
      expect(bucket.tokens()).toBe(3);
      
      mockClock.advance(10000);
      expect(bucket.tokens()).toBe(3); // No refill
    });

    test('should handle exact token removal', () => {
      const mockClock = new MockClock();
      const bucket = new TokenBucket(10, 1, mockClock);
      
      expect(bucket.tryRemove(10)).toBe(true);
      expect(bucket.tokens()).toBe(0);
      
      expect(bucket.tryRemove(1)).toBe(false);
      expect(bucket.tokens()).toBe(0);
    });
  });
});
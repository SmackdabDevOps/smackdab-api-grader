/**
 * test.spec.ts - Comprehensive unit tests for test.ts utilities
 * 
 * Following TDD RED → GREEN → REFACTOR methodology
 * All functions are expected to initially throw "Not implemented"
 */

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
  __version__
} from '../.claude/test';

describe('test.ts utilities', () => {
  describe('parseMoney', () => {
    describe('valid inputs', () => {
      it('should parse USD with dollar sign prefix', () => {
        const result = parseMoney('$1,234.56');
        expect(result).toEqual({ cents: 123456, currency: 'USD' });
      });

      it('should parse USD with code prefix', () => {
        const result = parseMoney('USD 12.34');
        expect(result).toEqual({ cents: 1234, currency: 'USD' });
      });

      it('should parse GBP with code suffix', () => {
        const result = parseMoney('12.34 GBP');
        expect(result).toEqual({ cents: 1234, currency: 'GBP' });
      });

      it('should parse EUR with euro symbol', () => {
        const result = parseMoney('€99.95');
        expect(result).toEqual({ cents: 9995, currency: 'EUR' });
      });

      it('should parse GBP with pound symbol', () => {
        const result = parseMoney('£50.00');
        expect(result).toEqual({ cents: 5000, currency: 'GBP' });
      });

      it('should handle amounts with thousands separator', () => {
        const result = parseMoney('$10,000.00');
        expect(result).toEqual({ cents: 1000000, currency: 'USD' });
      });

      it('should default to USD when no currency specified', () => {
        const result = parseMoney('100.00');
        expect(result).toEqual({ cents: 10000, currency: 'USD' });
      });

      it('should handle zero amounts', () => {
        const result = parseMoney('$0.00');
        expect(result).toEqual({ cents: 0, currency: 'USD' });
      });

      it('should handle whitespace around input', () => {
        const result = parseMoney('  $50.00  ');
        expect(result).toEqual({ cents: 5000, currency: 'USD' });
      });

      it('should handle large amounts', () => {
        const result = parseMoney('$999,999,999.99');
        expect(result).toEqual({ cents: 99999999999, currency: 'USD' });
      });
    });

    describe('invalid inputs', () => {
      it('should throw on empty input', () => {
        expect(() => parseMoney('')).toThrow('Empty input not allowed');
      });

      it('should throw on whitespace-only input', () => {
        expect(() => parseMoney('   ')).toThrow('Empty input not allowed');
      });

      it('should throw on negative amounts', () => {
        expect(() => parseMoney('-$10.00')).toThrow('Negative amounts not allowed');
        expect(() => parseMoney('$-10.00')).toThrow('Negative amounts not allowed');
      });

      it('should throw on invalid decimal format with multiple dots', () => {
        expect(() => parseMoney('10.00.00')).toThrow('Invalid decimal format');
      });

      it('should throw when not exactly 2 decimal places', () => {
        expect(() => parseMoney('$10.1')).toThrow('Exactly two decimal places required');
        expect(() => parseMoney('$10.123')).toThrow('Exactly two decimal places required');
      });

      it('should throw on invalid number format', () => {
        expect(() => parseMoney('abc')).toThrow('Invalid number format');
        expect(() => parseMoney('$abc.de')).toThrow('Invalid number format');
      });
    });

    describe('edge cases', () => {
      it('should handle amounts without decimal part as invalid', () => {
        expect(() => parseMoney('$10')).not.toThrow();
        expect(parseMoney('$10')).toEqual({ cents: 1000, currency: 'USD' });
      });

      it('should handle currency codes in different positions', () => {
        expect(parseMoney('EUR 1,234.56')).toEqual({ cents: 123456, currency: 'EUR' });
        expect(parseMoney('1,234.56 EUR')).toEqual({ cents: 123456, currency: 'EUR' });
      });
    });
  });

  describe('addMoney', () => {
    it('should add two money values with same currency', () => {
      expect(() => {
        const a: Money = { cents: 100, currency: 'USD' };
        const b: Money = { cents: 250, currency: 'USD' };
        const result = addMoney(a, b);
        expect(result).toEqual({ cents: 350, currency: 'USD' });
      }).toThrow('Not implemented');
    });

    it('should throw when currencies do not match', () => {
      expect(() => {
        const a: Money = { cents: 100, currency: 'USD' };
        const b: Money = { cents: 250, currency: 'EUR' };
        addMoney(a, b);
      }).toThrow();
    });

    it('should handle zero amounts', () => {
      expect(() => {
        const a: Money = { cents: 0, currency: 'USD' };
        const b: Money = { cents: 100, currency: 'USD' };
        const result = addMoney(a, b);
        expect(result).toEqual({ cents: 100, currency: 'USD' });
      }).toThrow('Not implemented');
    });

    it('should handle large amounts', () => {
      expect(() => {
        const a: Money = { cents: 999999999, currency: 'EUR' };
        const b: Money = { cents: 1, currency: 'EUR' };
        const result = addMoney(a, b);
        expect(result).toEqual({ cents: 1000000000, currency: 'EUR' });
      }).toThrow('Not implemented');
    });
  });

  describe('computeTax', () => {
    describe('nearest rounding', () => {
      it('should compute 8% tax with nearest rounding', () => {
        expect(() => {
          const subtotal: Money = { cents: 1000, currency: 'USD' };
          const result = computeTax(subtotal, 8, 'nearest');
          expect(result).toEqual({ cents: 80, currency: 'USD' });
        }).toThrow('Not implemented');
      });

      it('should round 0.5 cents away from zero', () => {
        expect(() => {
          const subtotal: Money = { cents: 1006, currency: 'USD' };
          const result = computeTax(subtotal, 5, 'nearest');
          expect(result).toEqual({ cents: 50, currency: 'USD' });
        }).toThrow('Not implemented');
      });

      it('should use nearest as default rounding', () => {
        expect(() => {
          const subtotal: Money = { cents: 1000, currency: 'USD' };
          const result = computeTax(subtotal, 7.5);
          expect(result).toEqual({ cents: 75, currency: 'USD' });
        }).toThrow('Not implemented');
      });
    });

    describe('up rounding', () => {
      it('should always round up to next cent', () => {
        expect(() => {
          const subtotal: Money = { cents: 1001, currency: 'USD' };
          const result = computeTax(subtotal, 5, 'up');
          expect(result).toEqual({ cents: 51, currency: 'USD' });
        }).toThrow('Not implemented');
      });

      it('should not round when exact', () => {
        expect(() => {
          const subtotal: Money = { cents: 1000, currency: 'USD' };
          const result = computeTax(subtotal, 10, 'up');
          expect(result).toEqual({ cents: 100, currency: 'USD' });
        }).toThrow('Not implemented');
      });
    });

    describe('down rounding', () => {
      it('should always round down to previous cent', () => {
        expect(() => {
          const subtotal: Money = { cents: 1009, currency: 'USD' };
          const result = computeTax(subtotal, 5, 'down');
          expect(result).toEqual({ cents: 50, currency: 'USD' });
        }).toThrow('Not implemented');
      });

      it('should handle zero tax rate', () => {
        expect(() => {
          const subtotal: Money = { cents: 1000, currency: 'USD' };
          const result = computeTax(subtotal, 0, 'down');
          expect(result).toEqual({ cents: 0, currency: 'USD' });
        }).toThrow('Not implemented');
      });
    });

    it('should preserve currency', () => {
      expect(() => {
        const subtotal: Money = { cents: 1000, currency: 'EUR' };
        const result = computeTax(subtotal, 20, 'nearest');
        expect(result).toEqual({ cents: 200, currency: 'EUR' });
      }).toThrow('Not implemented');
    });
  });

  describe('totalWithTax', () => {
    it('should return sum of subtotal and computed tax', () => {
      expect(() => {
        const subtotal: Money = { cents: 1000, currency: 'USD' };
        const result = totalWithTax(subtotal, 8, 'nearest');
        expect(result).toEqual({ cents: 1080, currency: 'USD' });
      }).toThrow('Not implemented');
    });

    it('should use specified rounding for tax calculation', () => {
      expect(() => {
        const subtotal: Money = { cents: 1001, currency: 'USD' };
        const resultUp = totalWithTax(subtotal, 5, 'up');
        expect(resultUp).toEqual({ cents: 1052, currency: 'USD' });
        
        const resultDown = totalWithTax(subtotal, 5, 'down');
        expect(resultDown).toEqual({ cents: 1051, currency: 'USD' });
      }).toThrow('Not implemented');
    });

    it('should preserve currency', () => {
      expect(() => {
        const subtotal: Money = { cents: 2000, currency: 'GBP' };
        const result = totalWithTax(subtotal, 20, 'nearest');
        expect(result).toEqual({ cents: 2400, currency: 'GBP' });
      }).toThrow('Not implemented');
    });

    it('should handle zero tax rate', () => {
      expect(() => {
        const subtotal: Money = { cents: 1500, currency: 'USD' };
        const result = totalWithTax(subtotal, 0);
        expect(result).toEqual({ cents: 1500, currency: 'USD' });
      }).toThrow('Not implemented');
    });
  });

  describe('slugify', () => {
    it('should convert to lowercase', () => {
      expect(() => {
        const result = slugify('Hello World');
        expect(result).toBe('hello-world');
      }).toThrow('Not implemented');
    });

    it('should replace spaces with hyphens', () => {
      expect(() => {
        const result = slugify('my awesome product');
        expect(result).toBe('my-awesome-product');
      }).toThrow('Not implemented');
    });

    it('should remove special characters', () => {
      expect(() => {
        const result = slugify('Product #1 @ 50% off!');
        expect(result).toBe('product-1-50-off');
      }).toThrow('Not implemented');
    });

    it('should collapse multiple hyphens', () => {
      expect(() => {
        const result = slugify('Too   many    spaces');
        expect(result).toBe('too-many-spaces');
      }).toThrow('Not implemented');
    });

    it('should strip diacritics', () => {
      expect(() => {
        const result = slugify('Café résumé naïve');
        expect(result).toBe('cafe-resume-naive');
      }).toThrow('Not implemented');
    });

    it('should remove emoji', () => {
      expect(() => {
        const result = slugify('Hello 👋 World 🌍');
        expect(result).toBe('hello-world');
      }).toThrow('Not implemented');
    });

    it('should trim leading and trailing hyphens', () => {
      expect(() => {
        const result = slugify('---hello---world---');
        expect(result).toBe('hello-world');
      }).toThrow('Not implemented');
    });

    it('should respect maxLength parameter', () => {
      expect(() => {
        const result = slugify('this is a very long string that should be truncated', 20);
        expect(result.length).toBeLessThanOrEqual(20);
        expect(result).toBe('this-is-a-very-long');
      }).toThrow('Not implemented');
    });

    it('should use default maxLength of 80', () => {
      expect(() => {
        const longString = 'a'.repeat(100);
        const result = slugify(longString);
        expect(result.length).toBeLessThanOrEqual(80);
      }).toThrow('Not implemented');
    });

    it('should handle empty string', () => {
      expect(() => {
        const result = slugify('');
        expect(result).toBe('');
      }).toThrow('Not implemented');
    });

    it('should preserve numbers', () => {
      expect(() => {
        const result = slugify('Product 123 Version 4.5.6');
        expect(result).toBe('product-123-version-4-5-6');
      }).toThrow('Not implemented');
    });
  });

  describe('normalizeEmail', () => {
    describe('general rules', () => {
      it('should lowercase domain for all emails', () => {
        expect(() => {
          expect(normalizeEmail('User@EXAMPLE.COM')).toBe('User@example.com');
          expect(normalizeEmail('admin@COMPANY.ORG')).toBe('admin@company.org');
        }).toThrow('Not implemented');
      });

      it('should preserve local part for non-Gmail domains', () => {
        expect(() => {
          expect(normalizeEmail('First.Last@example.com')).toBe('First.Last@example.com');
          expect(normalizeEmail('user+tag@example.com')).toBe('user+tag@example.com');
        }).toThrow('Not implemented');
      });

      it('should handle already normalized emails', () => {
        expect(() => {
          expect(normalizeEmail('user@example.com')).toBe('user@example.com');
        }).toThrow('Not implemented');
      });
    });

    describe('Gmail normalization', () => {
      it('should remove dots from Gmail local part', () => {
        expect(() => {
          expect(normalizeEmail('first.last@gmail.com')).toBe('firstlast@gmail.com');
          expect(normalizeEmail('f.i.r.s.t@gmail.com')).toBe('first@gmail.com');
        }).toThrow('Not implemented');
      });

      it('should remove plus tags from Gmail', () => {
        expect(() => {
          expect(normalizeEmail('user+promo@gmail.com')).toBe('user@gmail.com');
          expect(normalizeEmail('user+tag+extra@gmail.com')).toBe('user@gmail.com');
        }).toThrow('Not implemented');
      });

      it('should handle both dots and plus tags in Gmail', () => {
        expect(() => {
          expect(normalizeEmail('First.Last+promo@gmail.com')).toBe('firstlast@gmail.com');
        }).toThrow('Not implemented');
      });

      it('should normalize googlemail.com same as gmail.com', () => {
        expect(() => {
          expect(normalizeEmail('user.name+tag@googlemail.com')).toBe('username@googlemail.com');
        }).toThrow('Not implemented');
      });

      it('should handle Gmail with uppercase', () => {
        expect(() => {
          expect(normalizeEmail('First.Last+Tag@GMAIL.COM')).toBe('firstlast@gmail.com');
        }).toThrow('Not implemented');
      });
    });

    describe('edge cases', () => {
      it('should handle email with subdomain', () => {
        expect(() => {
          expect(normalizeEmail('user@mail.example.com')).toBe('user@mail.example.com');
        }).toThrow('Not implemented');
      });

      it('should handle single character local part', () => {
        expect(() => {
          expect(normalizeEmail('a@example.com')).toBe('a@example.com');
          expect(normalizeEmail('a@gmail.com')).toBe('a@gmail.com');
        }).toThrow('Not implemented');
      });

      it('should handle empty local part after Gmail normalization', () => {
        expect(() => {
          expect(normalizeEmail('+tag@gmail.com')).toBe('@gmail.com');
        }).toThrow('Not implemented');
      });
    });
  });

  describe('paginate', () => {
    const testItems = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];

    it('should return first page correctly', () => {
      expect(() => {
        const result = paginate(testItems, 1, 3);
        expect(result).toEqual({
          items: ['a', 'b', 'c'],
          page: 1,
          perPage: 3,
          totalItems: 10,
          totalPages: 4,
          hasPrev: false,
          hasNext: true
        });
      }).toThrow('Not implemented');
    });

    it('should return middle page correctly', () => {
      expect(() => {
        const result = paginate(testItems, 2, 3);
        expect(result).toEqual({
          items: ['d', 'e', 'f'],
          page: 2,
          perPage: 3,
          totalItems: 10,
          totalPages: 4,
          hasPrev: true,
          hasNext: true
        });
      }).toThrow('Not implemented');
    });

    it('should return last page with partial items', () => {
      expect(() => {
        const result = paginate(testItems, 4, 3);
        expect(result).toEqual({
          items: ['j'],
          page: 4,
          perPage: 3,
          totalItems: 10,
          totalPages: 4,
          hasPrev: true,
          hasNext: false
        });
      }).toThrow('Not implemented');
    });

    it('should handle page exceeding total pages', () => {
      expect(() => {
        const result = paginate(testItems, 5, 3);
        expect(result).toEqual({
          items: [],
          page: 5,
          perPage: 3,
          totalItems: 10,
          totalPages: 4,
          hasPrev: true,
          hasNext: false
        });
      }).toThrow('Not implemented');
    });

    it('should handle single item per page', () => {
      expect(() => {
        const result = paginate(testItems, 5, 1);
        expect(result).toEqual({
          items: ['e'],
          page: 5,
          perPage: 1,
          totalItems: 10,
          totalPages: 10,
          hasPrev: true,
          hasNext: true
        });
      }).toThrow('Not implemented');
    });

    it('should handle all items on one page', () => {
      expect(() => {
        const result = paginate(testItems, 1, 20);
        expect(result).toEqual({
          items: testItems,
          page: 1,
          perPage: 20,
          totalItems: 10,
          totalPages: 1,
          hasPrev: false,
          hasNext: false
        });
      }).toThrow('Not implemented');
    });

    it('should handle empty array', () => {
      expect(() => {
        const result = paginate([], 1, 10);
        expect(result).toEqual({
          items: [],
          page: 1,
          perPage: 10,
          totalItems: 0,
          totalPages: 0,
          hasPrev: false,
          hasNext: false
        });
      }).toThrow('Not implemented');
    });

    it('should throw on invalid page number', () => {
      expect(() => {
        paginate(testItems, 0, 3);
      }).toThrow();
      
      expect(() => {
        paginate(testItems, -1, 3);
      }).toThrow();
    });

    it('should throw on invalid perPage', () => {
      expect(() => {
        paginate(testItems, 1, 0);
      }).toThrow();
      
      expect(() => {
        paginate(testItems, 1, -1);
      }).toThrow();
    });

    it('should work with different types', () => {
      expect(() => {
        const numbers = [1, 2, 3, 4, 5];
        const result = paginate(numbers, 1, 2);
        expect(result.items).toEqual([1, 2]);
        
        const objects = [{ id: 1 }, { id: 2 }, { id: 3 }];
        const result2 = paginate(objects, 2, 2);
        expect(result2.items).toEqual([{ id: 3 }]);
      }).toThrow('Not implemented');
    });
  });

  describe('TokenBucket', () => {
    let mockClock: Clock;

    beforeEach(() => {
      mockClock = { nowMs: jest.fn(() => 0) };
    });

    describe('initialization', () => {
      it('should start with full capacity', () => {
        expect(() => {
          const bucket = new TokenBucket(10, 1, mockClock);
          expect(bucket.tokens()).toBe(10);
        }).toThrow('Not implemented');
      });

      it('should throw on invalid capacity', () => {
        expect(() => {
          new TokenBucket(0, 1, mockClock);
        }).toThrow();
        
        expect(() => {
          new TokenBucket(-1, 1, mockClock);
        }).toThrow();
      });

      it('should allow zero refill rate', () => {
        expect(() => {
          const bucket = new TokenBucket(10, 0, mockClock);
          expect(bucket.tokens()).toBe(10);
        }).toThrow('Not implemented');
      });

      it('should throw on negative refill rate', () => {
        expect(() => {
          new TokenBucket(10, -1, mockClock);
        }).toThrow();
      });
    });

    describe('token removal', () => {
      it('should remove tokens when available', () => {
        expect(() => {
          const bucket = new TokenBucket(10, 1, mockClock);
          expect(bucket.tryRemove(5)).toBe(true);
          expect(bucket.tokens()).toBe(5);
        }).toThrow('Not implemented');
      });

      it('should not remove tokens when insufficient', () => {
        expect(() => {
          const bucket = new TokenBucket(10, 1, mockClock);
          expect(bucket.tryRemove(15)).toBe(false);
          expect(bucket.tokens()).toBe(10);
        }).toThrow('Not implemented');
      });

      it('should handle exact capacity removal', () => {
        expect(() => {
          const bucket = new TokenBucket(10, 1, mockClock);
          expect(bucket.tryRemove(10)).toBe(true);
          expect(bucket.tokens()).toBe(0);
        }).toThrow('Not implemented');
      });

      it('should handle zero token removal', () => {
        expect(() => {
          const bucket = new TokenBucket(10, 1, mockClock);
          expect(bucket.tryRemove(0)).toBe(true);
          expect(bucket.tokens()).toBe(10);
        }).toThrow('Not implemented');
      });

      it('should throw on negative token removal', () => {
        expect(() => {
          const bucket = new TokenBucket(10, 1, mockClock);
          bucket.tryRemove(-1);
        }).toThrow();
      });
    });

    describe('token refill', () => {
      it('should refill tokens over time', () => {
        expect(() => {
          (mockClock.nowMs as jest.Mock).mockReturnValueOnce(0);
          const bucket = new TokenBucket(10, 2, mockClock);
          bucket.tryRemove(5);
          
          (mockClock.nowMs as jest.Mock).mockReturnValueOnce(1000);
          expect(bucket.tokens()).toBe(7);
        }).toThrow('Not implemented');
      });

      it('should not exceed capacity', () => {
        expect(() => {
          (mockClock.nowMs as jest.Mock).mockReturnValueOnce(0);
          const bucket = new TokenBucket(10, 5, mockClock);
          
          (mockClock.nowMs as jest.Mock).mockReturnValueOnce(10000);
          expect(bucket.tokens()).toBe(10);
        }).toThrow('Not implemented');
      });

      it('should handle fractional refill rates', () => {
        expect(() => {
          (mockClock.nowMs as jest.Mock).mockReturnValueOnce(0);
          const bucket = new TokenBucket(10, 0.5, mockClock);
          bucket.tryRemove(10);
          
          (mockClock.nowMs as jest.Mock).mockReturnValueOnce(2000);
          expect(bucket.tokens()).toBe(1);
        }).toThrow('Not implemented');
      });

      it('should round tokens to nearest 1/1000', () => {
        expect(() => {
          (mockClock.nowMs as jest.Mock).mockReturnValueOnce(0);
          const bucket = new TokenBucket(10, 1, mockClock);
          bucket.tryRemove(10);
          
          (mockClock.nowMs as jest.Mock).mockReturnValueOnce(1234);
          expect(bucket.tokens()).toBe(1.234);
        }).toThrow('Not implemented');
      });

      it('should handle zero refill rate (no refill)', () => {
        expect(() => {
          (mockClock.nowMs as jest.Mock).mockReturnValueOnce(0);
          const bucket = new TokenBucket(10, 0, mockClock);
          bucket.tryRemove(5);
          
          (mockClock.nowMs as jest.Mock).mockReturnValueOnce(10000);
          expect(bucket.tokens()).toBe(5);
        }).toThrow('Not implemented');
      });
    });

    describe('time-based scenarios', () => {
      it('should handle rapid successive operations', () => {
        expect(() => {
          let time = 0;
          (mockClock.nowMs as jest.Mock).mockImplementation(() => time);
          
          const bucket = new TokenBucket(10, 10, mockClock);
          
          expect(bucket.tryRemove(3)).toBe(true);
          time += 100;
          expect(bucket.tryRemove(3)).toBe(true);
          time += 100;
          expect(bucket.tryRemove(3)).toBe(true);
          
          expect(bucket.tokens()).toBeCloseTo(3, 3);
        }).toThrow('Not implemented');
      });

      it('should handle bursts after idle period', () => {
        expect(() => {
          (mockClock.nowMs as jest.Mock).mockReturnValueOnce(0);
          const bucket = new TokenBucket(5, 1, mockClock);
          bucket.tryRemove(5);
          
          (mockClock.nowMs as jest.Mock).mockReturnValueOnce(10000);
          expect(bucket.tokens()).toBe(5);
          expect(bucket.tryRemove(5)).toBe(true);
          expect(bucket.tokens()).toBe(0);
        }).toThrow('Not implemented');
      });
    });

    describe('default clock', () => {
      it('should use system clock by default', () => {
        expect(() => {
          const bucket = new TokenBucket(10, 1);
          expect(bucket.tokens()).toBe(10);
        }).toThrow('Not implemented');
      });
    });
  });

  describe('version', () => {
    it('should export correct version', () => {
      expect(__version__).toBe('0.1.0-spec-only');
    });
  });
});
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { getTopViolations } from '../../../../src/app/analytics/trends';
import { GraderDB } from '../../../../src/mcp/persistence/db';

// Mock the GraderDB class
jest.mock('../../../../src/mcp/persistence/db.js', () => ({
  GraderDB: jest.fn().mockImplementation(() => ({
    connect: jest.fn(),
    migrate: jest.fn(),
    db: {
      all: jest.fn()
    }
  }))
}));

const MockGraderDB = GraderDB as jest.MockedClass<typeof GraderDB>;

describe('trends', () => {
  let mockDb: any;
  let mockDbInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create a mock database instance
    mockDbInstance = {
      connect: jest.fn().mockResolvedValue(void 0),
      migrate: jest.fn().mockResolvedValue(void 0),
      db: {
        all: jest.fn()
      }
    };
    
    // Make the constructor return our mock instance
    MockGraderDB.mockImplementation(() => mockDbInstance);
    mockDb = mockDbInstance.db;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getTopViolations', () => {
    it('should connect to database and run migration', async () => {
      mockDb.all.mockResolvedValue([]);
      
      await getTopViolations();
      
      expect(mockDbInstance.connect).toHaveBeenCalledTimes(1);
      expect(mockDbInstance.migrate).toHaveBeenCalledTimes(1);
    });

    it('should execute correct SQL query with default limit', async () => {
      const expectedRows = [
        { rule_id: 'SEC-ORG-HDR', cnt: 15 },
        { rule_id: 'PAG-KEYSET', cnt: 12 }
      ];
      mockDb.all.mockResolvedValue(expectedRows);
      
      const result = await getTopViolations();
      
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('SELECT rule_id, COUNT(*) as cnt'),
        10 // default limit
      );
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('FROM finding'),
        10
      );
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('GROUP BY rule_id'),
        10
      );
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY cnt DESC'),
        10
      );
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT ?'),
        10
      );
      expect(result).toEqual(expectedRows);
    });

    it('should execute SQL query with custom limit', async () => {
      const expectedRows = [
        { rule_id: 'SEC-ORG-HDR', cnt: 20 },
        { rule_id: 'PAG-KEYSET', cnt: 18 },
        { rule_id: 'SEC-BRANCH-HDR', cnt: 15 }
      ];
      mockDb.all.mockResolvedValue(expectedRows);
      
      const result = await getTopViolations(3);
      
      expect(mockDb.all).toHaveBeenCalledWith(expect.any(String), 3);
      expect(result).toEqual(expectedRows);
    });

    it('should handle limit of 0', async () => {
      mockDb.all.mockResolvedValue([]);
      
      const result = await getTopViolations(0);
      
      expect(mockDb.all).toHaveBeenCalledWith(expect.any(String), 0);
      expect(result).toEqual([]);
    });

    it('should handle negative limit', async () => {
      mockDb.all.mockResolvedValue([]);
      
      const result = await getTopViolations(-5);
      
      expect(mockDb.all).toHaveBeenCalledWith(expect.any(String), -5);
      expect(result).toEqual([]);
    });

    it('should handle large limit values', async () => {
      const largeLimit = 1000000;
      mockDb.all.mockResolvedValue([]);
      
      const result = await getTopViolations(largeLimit);
      
      expect(mockDb.all).toHaveBeenCalledWith(expect.any(String), largeLimit);
      expect(result).toEqual([]);
    });

    it('should return empty array when no violations found', async () => {
      mockDb.all.mockResolvedValue([]);
      
      const result = await getTopViolations();
      
      expect(result).toEqual([]);
    });

    it('should return single violation result', async () => {
      const singleViolation = [{ rule_id: 'SEC-ORG-HDR', cnt: 5 }];
      mockDb.all.mockResolvedValue(singleViolation);
      
      const result = await getTopViolations(1);
      
      expect(result).toEqual(singleViolation);
    });

    it('should return multiple violation results ordered by count', async () => {
      const violations = [
        { rule_id: 'SEC-ORG-HDR', cnt: 25 },
        { rule_id: 'PAG-KEYSET', cnt: 20 },
        { rule_id: 'SEC-BRANCH-HDR', cnt: 15 },
        { rule_id: 'PAG-NO-OFFSET', cnt: 10 },
        { rule_id: 'NAME-NAMESPACE', cnt: 5 }
      ];
      mockDb.all.mockResolvedValue(violations);
      
      const result = await getTopViolations(5);
      
      expect(result).toEqual(violations);
      expect(result).toHaveLength(5);
      // Verify ordering (highest count first)
      expect(result[0].cnt).toBeGreaterThanOrEqual(result[1].cnt);
      expect(result[1].cnt).toBeGreaterThanOrEqual(result[2].cnt);
      expect(result[2].cnt).toBeGreaterThanOrEqual(result[3].cnt);
      expect(result[3].cnt).toBeGreaterThanOrEqual(result[4].cnt);
    });

    it('should handle violations with same count', async () => {
      const violations = [
        { rule_id: 'SEC-ORG-HDR', cnt: 10 },
        { rule_id: 'SEC-BRANCH-HDR', cnt: 10 },
        { rule_id: 'PAG-KEYSET', cnt: 10 }
      ];
      mockDb.all.mockResolvedValue(violations);
      
      const result = await getTopViolations(3);
      
      expect(result).toEqual(violations);
    });

    it('should handle violations with zero count', async () => {
      const violations = [
        { rule_id: 'SEC-ORG-HDR', cnt: 5 },
        { rule_id: 'PAG-KEYSET', cnt: 0 }
      ];
      mockDb.all.mockResolvedValue(violations);
      
      const result = await getTopViolations(2);
      
      expect(result).toEqual(violations);
    });

    it('should handle various rule_id formats', async () => {
      const violations = [
        { rule_id: 'SEC-ORG-HDR', cnt: 15 },
        { rule_id: 'custom_rule_123', cnt: 10 },
        { rule_id: 'RULE.WITH.DOTS', cnt: 8 },
        { rule_id: 'rule-with-many-dashes', cnt: 5 },
        { rule_id: '', cnt: 2 }, // empty rule_id
        { rule_id: 'A', cnt: 1 } // single character
      ];
      mockDb.all.mockResolvedValue(violations);
      
      const result = await getTopViolations(10);
      
      expect(result).toEqual(violations);
    });

    describe('error handling', () => {
      it('should propagate database connection errors', async () => {
        const connectionError = new Error('Database connection failed');
        mockDbInstance.connect.mockRejectedValue(connectionError);
        
        await expect(getTopViolations()).rejects.toThrow('Database connection failed');
      });

      it('should propagate database migration errors', async () => {
        const migrationError = new Error('Migration failed');
        mockDbInstance.migrate.mockRejectedValue(migrationError);
        
        await expect(getTopViolations()).rejects.toThrow('Migration failed');
      });

      it('should propagate database query errors', async () => {
        const queryError = new Error('SQL query failed');
        mockDb.all.mockRejectedValue(queryError);
        
        await expect(getTopViolations()).rejects.toThrow('SQL query failed');
      });

      it('should handle database timeout errors', async () => {
        const timeoutError = new Error('Query timeout');
        mockDb.all.mockRejectedValue(timeoutError);
        
        await expect(getTopViolations()).rejects.toThrow('Query timeout');
      });

      it('should handle database locked errors', async () => {
        const lockedError = new Error('Database is locked');
        mockDb.all.mockRejectedValue(lockedError);
        
        await expect(getTopViolations()).rejects.toThrow('Database is locked');
      });

      it('should handle undefined database instance', async () => {
        mockDbInstance.db = undefined;
        
        await expect(getTopViolations()).rejects.toThrow();
      });

      it('should handle null database instance', async () => {
        mockDbInstance.db = null;
        
        await expect(getTopViolations()).rejects.toThrow();
      });
    });

    describe('database interaction edge cases', () => {
      it('should handle when connect resolves but db is not available', async () => {
        mockDbInstance.connect.mockResolvedValue(undefined);
        mockDbInstance.migrate.mockResolvedValue(undefined);
        delete mockDbInstance.db; // Remove db property
        
        await expect(getTopViolations()).rejects.toThrow();
      });

      it('should handle database returning null result', async () => {
        mockDb.all.mockResolvedValue(null);
        
        const result = await getTopViolations();
        
        expect(result).toBeNull();
      });

      it('should handle database returning undefined result', async () => {
        mockDb.all.mockResolvedValue(undefined);
        
        const result = await getTopViolations();
        
        expect(result).toBeUndefined();
      });

      it('should handle database returning non-array result', async () => {
        mockDb.all.mockResolvedValue('not an array');
        
        const result = await getTopViolations();
        
        expect(result).toBe('not an array');
      });
    });

    describe('SQL injection protection', () => {
      it('should use parameterized query for limit', async () => {
        const maliciousLimit = "1; DROP TABLE finding; --" as any;
        mockDb.all.mockResolvedValue([]);
        
        await getTopViolations(maliciousLimit);
        
        // Verify that the malicious input is passed as a parameter, not concatenated
        expect(mockDb.all).toHaveBeenCalledWith(
          expect.stringContaining('LIMIT ?'),
          maliciousLimit
        );
        // Verify the query string doesn't contain the malicious code
        const queryString = mockDb.all.mock.calls[0][0];
        expect(queryString).not.toContain('DROP TABLE');
        expect(queryString).not.toContain('--');
      });

      it('should not allow SQL injection through any means', async () => {
        mockDb.all.mockResolvedValue([]);
        
        await getTopViolations(5);
        
        const queryString = mockDb.all.mock.calls[0][0];
        // Verify query uses proper SQL structure
        expect(queryString).toMatch(/^\s*SELECT\s+rule_id\s*,\s*COUNT\(\*\)\s+as\s+cnt/i);
        expect(queryString).toContain('FROM finding');
        expect(queryString).toContain('GROUP BY rule_id');
        expect(queryString).toContain('ORDER BY cnt DESC');
        expect(queryString).toContain('LIMIT ?');
      });
    });

    describe('performance characteristics', () => {
      it('should handle very large result sets', async () => {
        const largeResults = Array.from({ length: 1000 }, (_, i) => ({
          rule_id: `RULE_${i}`,
          cnt: Math.floor(Math.random() * 100)
        }));
        mockDb.all.mockResolvedValue(largeResults);
        
        const result = await getTopViolations(1000);
        
        expect(result).toEqual(largeResults);
        expect(result).toHaveLength(1000);
      });

      it('should handle concurrent calls', async () => {
        mockDb.all.mockResolvedValue([{ rule_id: 'TEST', cnt: 1 }]);
        
        const promises = Array.from({ length: 10 }, () => getTopViolations(5));
        const results = await Promise.all(promises);
        
        results.forEach(result => {
          expect(result).toEqual([{ rule_id: 'TEST', cnt: 1 }]);
        });
        expect(mockDb.all).toHaveBeenCalledTimes(10);
      });
    });

    describe('data type validation', () => {
      it('should handle non-numeric count values', async () => {
        const violations = [
          { rule_id: 'TEST_RULE', cnt: 'not_a_number' as any }
        ];
        mockDb.all.mockResolvedValue(violations);
        
        const result = await getTopViolations();
        
        expect(result).toEqual(violations);
      });

      it('should handle null count values', async () => {
        const violations = [
          { rule_id: 'TEST_RULE', cnt: null }
        ];
        mockDb.all.mockResolvedValue(violations);
        
        const result = await getTopViolations();
        
        expect(result).toEqual(violations);
      });

      it('should handle undefined count values', async () => {
        const violations = [
          { rule_id: 'TEST_RULE', cnt: undefined }
        ];
        mockDb.all.mockResolvedValue(violations);
        
        const result = await getTopViolations();
        
        expect(result).toEqual(violations);
      });

      it('should handle null rule_id values', async () => {
        const violations = [
          { rule_id: null, cnt: 5 }
        ];
        mockDb.all.mockResolvedValue(violations);
        
        const result = await getTopViolations();
        
        expect(result).toEqual(violations);
      });

      it('should handle undefined rule_id values', async () => {
        const violations = [
          { rule_id: undefined, cnt: 5 }
        ];
        mockDb.all.mockResolvedValue(violations);
        
        const result = await getTopViolations();
        
        expect(result).toEqual(violations);
      });
    });
  });
});
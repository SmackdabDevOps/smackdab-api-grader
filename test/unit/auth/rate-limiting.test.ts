/**
 * Unit tests for rate limiting functionality
 * Tests rate limiting behavior including:
 * - Per-team rate limiting
 * - Rate limit windows and resets
 * - Rate limit headers
 * - Rate limit enforcement
 * - Edge cases and security scenarios
 */

import { Request, Response, NextFunction } from 'express';
import { 
  authenticateRequest, 
  initializeApiKeys,
  getApiKeys,
  clearRateLimits
} from '../../../src/mcp/auth';

// Mock Express request/response objects
const createMockRequest = (headers: any = {}): Partial<Request> => ({
  headers,
  method: 'GET',
  path: '/test'
});

const createMockResponse = (): Partial<Response> => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res;
};

const createMockNext = (): NextFunction => jest.fn();

describe('Rate Limiting', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let originalEnv: NodeJS.ProcessEnv;
  let originalDateNow: () => number;
  let mockTime: number;

  beforeEach(() => {
    // Clear API keys and rate limits before each test
    getApiKeys().clear();
    clearRateLimits();
    
    // Setup fresh mocks
    mockRequest = createMockRequest();
    mockResponse = createMockResponse();
    mockNext = createMockNext();
    
    // Store original environment
    originalEnv = { ...process.env };
    
    // Mock Date.now for consistent time-based testing
    mockTime = 1640995200000; // 2022-01-01T00:00:00.000Z
    originalDateNow = Date.now;
    Date.now = jest.fn(() => mockTime);
    
    // Setup test environment
    process.env.NODE_ENV = 'test';
    process.env.RATE_LIMIT = '5'; // 5 requests per minute for testing
    
    // Directly add API keys to the map instead of using initializeApiKeys
    // This ensures the keys are properly available for testing
    getApiKeys().set('sk_test_team_alpha_key', {
      teamId: 'team-alpha',
      userId: 'user-alpha'
    });
    getApiKeys().set('sk_test_team_beta_key', {
      teamId: 'team-beta',
      userId: 'user-beta'
    });
  });

  afterEach(() => {
    // Restore environment and time
    process.env = originalEnv;
    Date.now = originalDateNow;
    jest.clearAllMocks();
  });

  describe('Rate Limit Enforcement', () => {
    test('should allow requests within rate limit', () => {
      mockRequest.headers = {
        authorization: 'Bearer sk_test_team_alpha_key'
      };

      // Make 5 requests (within limit)
      for (let i = 0; i < 5; i++) {
        const req = createMockRequest({ authorization: 'Bearer sk_test_team_alpha_key' });
        const res = createMockResponse();
        const next = createMockNext();
        
        authenticateRequest(req as Request, res as Response, next);
        
        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalledWith(429);
      }
    });

    test('should reject requests exceeding rate limit', () => {
      mockRequest.headers = {
        authorization: 'Bearer sk_test_team_alpha_key'
      };

      // Make requests up to limit
      for (let i = 0; i < 5; i++) {
        const req = createMockRequest({ authorization: 'Bearer sk_test_team_alpha_key' });
        const res = createMockResponse();
        const next = createMockNext();
        authenticateRequest(req as Request, res as Response, next);
      }

      // 6th request should be rate limited
      const req = createMockRequest({ authorization: 'Bearer sk_test_team_alpha_key' });
      const res = createMockResponse();
      const next = createMockNext();
      
      authenticateRequest(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Rate limit exceeded',
        retryAfter: 60
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should set Retry-After header when rate limited', () => {
      mockRequest.headers = {
        authorization: 'Bearer sk_test_team_alpha_key'
      };

      // Exhaust rate limit
      for (let i = 0; i < 5; i++) {
        const req = createMockRequest({ authorization: 'Bearer sk_test_team_alpha_key' });
        const res = createMockResponse();
        const next = createMockNext();
        authenticateRequest(req as Request, res as Response, next);
      }

      // Next request should include Retry-After header
      const req = createMockRequest({ authorization: 'Bearer sk_test_team_alpha_key' });
      const res = createMockResponse();
      const next = createMockNext();
      
      authenticateRequest(req as Request, res as Response, next);

      expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '60');
    });

    test('should calculate correct Retry-After time', () => {
      mockRequest.headers = {
        authorization: 'Bearer sk_test_team_alpha_key'
      };

      // Exhaust rate limit
      for (let i = 0; i < 5; i++) {
        const req = createMockRequest({ authorization: 'Bearer sk_test_team_alpha_key' });
        const res = createMockResponse();
        const next = createMockNext();
        authenticateRequest(req as Request, res as Response, next);
      }

      // Advance time to 30 seconds later
      mockTime += 30000;

      const req = createMockRequest({ authorization: 'Bearer sk_test_team_alpha_key' });
      const res = createMockResponse();
      const next = createMockNext();
      
      authenticateRequest(req as Request, res as Response, next);

      expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '30'); // 30 seconds remaining
    });
  });

  describe('Rate Limit Windows', () => {
    test('should reset rate limit after time window', () => {
      mockRequest.headers = {
        authorization: 'Bearer sk_test_team_alpha_key'
      };

      // Exhaust rate limit
      for (let i = 0; i < 5; i++) {
        const req = createMockRequest({ authorization: 'Bearer sk_test_team_alpha_key' });
        const res = createMockResponse();
        const next = createMockNext();
        authenticateRequest(req as Request, res as Response, next);
      }

      // Verify rate limit is active
      const rateLimitedReq = createMockRequest({ authorization: 'Bearer sk_test_team_alpha_key' });
      const rateLimitedRes = createMockResponse();
      const rateLimitedNext = createMockNext();
      
      authenticateRequest(rateLimitedReq as Request, rateLimitedRes as Response, rateLimitedNext);
      expect(rateLimitedRes.status).toHaveBeenCalledWith(429);

      // Advance time past window (60 seconds)
      mockTime += 60001;

      // Next request should succeed
      const resetReq = createMockRequest({ authorization: 'Bearer sk_test_team_alpha_key' });
      const resetRes = createMockResponse();
      const resetNext = createMockNext();
      
      authenticateRequest(resetReq as Request, resetRes as Response, resetNext);

      expect(resetNext).toHaveBeenCalled();
      expect(resetRes.status).not.toHaveBeenCalledWith(429);
    });

    test('should update count within same window', () => {
      mockRequest.headers = {
        authorization: 'Bearer sk_test_team_alpha_key'
      };

      // Make 3 requests
      for (let i = 0; i < 3; i++) {
        const req = createMockRequest({ authorization: 'Bearer sk_test_team_alpha_key' });
        const res = createMockResponse();
        const next = createMockNext();
        authenticateRequest(req as Request, res as Response, next);
        expect(next).toHaveBeenCalled();
      }

      // Advance time by 30 seconds (still within window)
      mockTime += 30000;

      // Make 2 more requests (should still work, total 5)
      for (let i = 0; i < 2; i++) {
        const req = createMockRequest({ authorization: 'Bearer sk_test_team_alpha_key' });
        const res = createMockResponse();
        const next = createMockNext();
        authenticateRequest(req as Request, res as Response, next);
        expect(next).toHaveBeenCalled();
      }

      // 6th request should be rate limited
      const req = createMockRequest({ authorization: 'Bearer sk_test_team_alpha_key' });
      const res = createMockResponse();
      const next = createMockNext();
      
      authenticateRequest(req as Request, res as Response, next);
      expect(res.status).toHaveBeenCalledWith(429);
    });

    test('should start fresh window after reset', () => {
      mockRequest.headers = {
        authorization: 'Bearer sk_test_team_alpha_key'
      };

      // Exhaust rate limit
      for (let i = 0; i < 5; i++) {
        const req = createMockRequest({ authorization: 'Bearer sk_test_team_alpha_key' });
        const res = createMockResponse();
        const next = createMockNext();
        authenticateRequest(req as Request, res as Response, next);
      }

      // Advance time past window
      mockTime += 60001;

      // Should be able to make full rate limit again
      for (let i = 0; i < 5; i++) {
        const req = createMockRequest({ authorization: 'Bearer sk_test_team_alpha_key' });
        const res = createMockResponse();
        const next = createMockNext();
        
        authenticateRequest(req as Request, res as Response, next);
        
        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalledWith(429);
      }
    });
  });

  describe('Team Isolation in Rate Limiting', () => {
    test('should maintain separate rate limits per team', () => {
      // Team Alpha exhausts their limit
      for (let i = 0; i < 5; i++) {
        const req = createMockRequest({ authorization: 'Bearer sk_test_team_alpha_key' });
        const res = createMockResponse();
        const next = createMockNext();
        authenticateRequest(req as Request, res as Response, next);
      }

      // Team Alpha should be rate limited
      const alphaReq = createMockRequest({ authorization: 'Bearer sk_test_team_alpha_key' });
      const alphaRes = createMockResponse();
      const alphaNext = createMockNext();
      
      authenticateRequest(alphaReq as Request, alphaRes as Response, alphaNext);
      expect(alphaRes.status).toHaveBeenCalledWith(429);

      // Team Beta should still have their full rate limit
      const betaReq = createMockRequest({ authorization: 'Bearer sk_test_team_beta_key' });
      const betaRes = createMockResponse();
      const betaNext = createMockNext();
      
      authenticateRequest(betaReq as Request, betaRes as Response, betaNext);
      expect(betaNext).toHaveBeenCalled();
      expect(betaRes.status).not.toHaveBeenCalledWith(429);
    });

    test('should not leak rate limit data between teams', () => {
      // Team Alpha makes some requests
      for (let i = 0; i < 3; i++) {
        const req = createMockRequest({ authorization: 'Bearer sk_test_team_alpha_key' });
        const res = createMockResponse();
        const next = createMockNext();
        authenticateRequest(req as Request, res as Response, next);
      }

      // Team Beta makes some requests
      for (let i = 0; i < 2; i++) {
        const req = createMockRequest({ authorization: 'Bearer sk_test_team_beta_key' });
        const res = createMockResponse();
        const next = createMockNext();
        authenticateRequest(req as Request, res as Response, next);
      }

      // Team Alpha should be able to make 2 more (5 total)
      for (let i = 0; i < 2; i++) {
        const req = createMockRequest({ authorization: 'Bearer sk_test_team_alpha_key' });
        const res = createMockResponse();
        const next = createMockNext();
        authenticateRequest(req as Request, res as Response, next);
        expect(next).toHaveBeenCalled();
      }

      // Team Beta should be able to make 3 more (5 total)
      for (let i = 0; i < 3; i++) {
        const req = createMockRequest({ authorization: 'Bearer sk_test_team_beta_key' });
        const res = createMockResponse();
        const next = createMockNext();
        authenticateRequest(req as Request, res as Response, next);
        expect(next).toHaveBeenCalled();
      }
    });

    test('should reset independently per team', () => {
      // Both teams exhaust their limits
      for (let i = 0; i < 5; i++) {
        const alphaReq = createMockRequest({ authorization: 'Bearer sk_test_team_alpha_key' });
        const alphaRes = createMockResponse();
        const alphaNext = createMockNext();
        authenticateRequest(alphaReq as Request, alphaRes as Response, alphaNext);

        const betaReq = createMockRequest({ authorization: 'Bearer sk_test_team_beta_key' });
        const betaRes = createMockResponse();
        const betaNext = createMockNext();
        authenticateRequest(betaReq as Request, betaRes as Response, betaNext);
      }

      // Both should be rate limited
      const alphaLimited = createMockRequest({ authorization: 'Bearer sk_test_team_alpha_key' });
      const alphaLimitedRes = createMockResponse();
      const alphaLimitedNext = createMockNext();
      
      authenticateRequest(alphaLimited as Request, alphaLimitedRes as Response, alphaLimitedNext);
      expect(alphaLimitedRes.status).toHaveBeenCalledWith(429);

      const betaLimited = createMockRequest({ authorization: 'Bearer sk_test_team_beta_key' });
      const betaLimitedRes = createMockResponse();
      const betaLimitedNext = createMockNext();
      
      authenticateRequest(betaLimited as Request, betaLimitedRes as Response, betaLimitedNext);
      expect(betaLimitedRes.status).toHaveBeenCalledWith(429);

      // Advance time to reset both
      mockTime += 60001;

      // Both teams should have fresh limits
      const alphaReset = createMockRequest({ authorization: 'Bearer sk_test_team_alpha_key' });
      const alphaResetRes = createMockResponse();
      const alphaResetNext = createMockNext();
      
      authenticateRequest(alphaReset as Request, alphaResetRes as Response, alphaResetNext);
      expect(alphaResetNext).toHaveBeenCalled();

      const betaReset = createMockRequest({ authorization: 'Bearer sk_test_team_beta_key' });
      const betaResetRes = createMockResponse();
      const betaResetNext = createMockNext();
      
      authenticateRequest(betaReset as Request, betaResetRes as Response, betaResetNext);
      expect(betaResetNext).toHaveBeenCalled();
    });
  });

  describe('Rate Limit Configuration', () => {
    test('should respect RATE_LIMIT environment variable', () => {
      // Clear and reinitialize with different rate limit
      getApiKeys().clear();
      clearRateLimits();
      process.env.RATE_LIMIT = '2'; // Only 2 requests per minute
      
      // Directly set API key instead of using initializeApiKeys
      getApiKeys().set('sk_test_low_limit_key', {
        teamId: 'low-limit-team',
        userId: 'test-user'
      });

      // Should allow 2 requests
      for (let i = 0; i < 2; i++) {
        const req = createMockRequest({ authorization: 'Bearer sk_test_low_limit_key' });
        const res = createMockResponse();
        const next = createMockNext();
        authenticateRequest(req as Request, res as Response, next);
        expect(next).toHaveBeenCalled();
      }

      // 3rd request should be rate limited
      const req = createMockRequest({ authorization: 'Bearer sk_test_low_limit_key' });
      const res = createMockResponse();
      const next = createMockNext();
      
      authenticateRequest(req as Request, res as Response, next);
      expect(res.status).toHaveBeenCalledWith(429);
    });

    test('should use default rate limit when environment variable not set', () => {
      getApiKeys().clear();
      clearRateLimits();
      delete process.env.RATE_LIMIT; // Remove rate limit env var
      
      // Directly set API key
      getApiKeys().set('sk_test_default_limit_key', {
        teamId: 'default-limit-team',
        userId: 'test-user'
      });

      // Default is 100, so should allow many requests
      for (let i = 0; i < 10; i++) {
        const req = createMockRequest({ authorization: 'Bearer sk_test_default_limit_key' });
        const res = createMockResponse();
        const next = createMockNext();
        authenticateRequest(req as Request, res as Response, next);
        expect(next).toHaveBeenCalled();
      }
    });

    test('should handle invalid RATE_LIMIT environment variable', () => {
      getApiKeys().clear();
      clearRateLimits();
      process.env.RATE_LIMIT = 'invalid-number';
      
      // Directly set API key
      getApiKeys().set('sk_test_invalid_limit_key', {
        teamId: 'invalid-limit-team',
        userId: 'test-user'
      });

      // Should fall back to default behavior (100 requests per minute)
      // Make multiple requests - should allow them since default is 100
      for (let i = 0; i < 10; i++) {
        const req = createMockRequest({ authorization: 'Bearer sk_test_invalid_limit_key' });
        const res = createMockResponse();
        const next = createMockNext();
        
        authenticateRequest(req as Request, res as Response, next);
        expect(next).toHaveBeenCalled();
      }
    });
  });

  describe('Rate Limiting Edge Cases', () => {
    test('should handle concurrent requests from same team', () => {
      // Simulate concurrent requests by not advancing time
      const requests = [];
      
      for (let i = 0; i < 6; i++) {
        const req = createMockRequest({ authorization: 'Bearer sk_test_team_alpha_key' });
        const res = createMockResponse();
        const next = createMockNext();
        
        requests.push({ req, res, next });
        authenticateRequest(req as Request, res as Response, next);
      }

      // First 5 should succeed, 6th should be rate limited
      for (let i = 0; i < 5; i++) {
        expect(requests[i].next).toHaveBeenCalled();
        expect(requests[i].res.status).not.toHaveBeenCalledWith(429);
      }
      
      expect(requests[5].res.status).toHaveBeenCalledWith(429);
      expect(requests[5].next).not.toHaveBeenCalled();
    });

    test('should handle very high rate limits', () => {
      getApiKeys().clear();
      clearRateLimits();
      process.env.RATE_LIMIT = '999999';
      
      // Directly set API key
      getApiKeys().set('sk_test_high_limit_key', {
        teamId: 'high-limit-team',
        userId: 'test-user'
      });

      // Should allow many requests
      for (let i = 0; i < 100; i++) {
        const req = createMockRequest({ authorization: 'Bearer sk_test_high_limit_key' });
        const res = createMockResponse();
        const next = createMockNext();
        authenticateRequest(req as Request, res as Response, next);
        expect(next).toHaveBeenCalled();
      }
    });

    test('should handle time going backwards', () => {
      mockRequest.headers = {
        authorization: 'Bearer sk_test_team_alpha_key'
      };

      // Make some requests
      for (let i = 0; i < 3; i++) {
        const req = createMockRequest({ authorization: 'Bearer sk_test_team_alpha_key' });
        const res = createMockResponse();
        const next = createMockNext();
        authenticateRequest(req as Request, res as Response, next);
      }

      // Time goes backwards (shouldn't happen in practice, but test resilience)
      mockTime -= 30000;

      // Should still enforce existing rate limit state
      const req = createMockRequest({ authorization: 'Bearer sk_test_team_alpha_key' });
      const res = createMockResponse();
      const next = createMockNext();
      
      authenticateRequest(req as Request, res as Response, next);
      
      // Should increment counter and still work (4th request)
      expect(next).toHaveBeenCalled();
    });

    test('should handle rate limit window edge exactly', () => {
      mockRequest.headers = {
        authorization: 'Bearer sk_test_team_alpha_key'
      };

      // Exhaust rate limit
      for (let i = 0; i < 5; i++) {
        const req = createMockRequest({ authorization: 'Bearer sk_test_team_alpha_key' });
        const res = createMockResponse();
        const next = createMockNext();
        authenticateRequest(req as Request, res as Response, next);
      }

      // Advance time to just before window expiry
      mockTime += 59999; // 1ms before window expiry

      const req = createMockRequest({ authorization: 'Bearer sk_test_team_alpha_key' });
      const res = createMockResponse();
      const next = createMockNext();
      
      authenticateRequest(req as Request, res as Response, next);
      
      // Just before window expiry, should still be rate limited
      expect(res.status).toHaveBeenCalledWith(429);

      // At exactly window expiry, should reset
      mockTime += 1; // Now at exactly 60000ms
      
      const nextReq = createMockRequest({ authorization: 'Bearer sk_test_team_alpha_key' });
      const nextRes = createMockResponse();
      const nextNext = createMockNext();
      
      authenticateRequest(nextReq as Request, nextRes as Response, nextNext);
      expect(nextNext).toHaveBeenCalled();
    });
  });
});
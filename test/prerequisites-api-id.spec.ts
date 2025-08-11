import { describe, it, expect, beforeEach } from '@jest/globals';
import { checkApiId } from '../src/scoring/prerequisites.js';

describe('Prerequisites - API ID Validation', () => {
  describe('checkApiId', () => {
    it('should pass when valid x-api-id is present', () => {
      const spec = {
        info: {
          title: 'Test API',
          version: '1.0.0',
          'x-api-id': 'acme_1736180423567_a3f8b2c9d4e5f6a7'
        }
      };

      const result = checkApiId(spec);
      
      expect(result.passed).toBe(true);
      expect(result.failures).toHaveLength(0);
    });

    it('should fail when x-api-id is missing', () => {
      const spec = {
        info: {
          title: 'Test API',
          version: '1.0.0'
        }
      };

      const result = checkApiId(spec);
      
      expect(result.passed).toBe(false);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].ruleId).toBe('PREREQ-API-ID');
      expect(result.failures[0].severity).toBe('critical');
      expect(result.failures[0].message).toContain('missing required x-api-id');
    });

    it('should fail when info section is missing', () => {
      const spec = {
        openapi: '3.0.3'
      };

      const result = checkApiId(spec);
      
      expect(result.passed).toBe(false);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].ruleId).toBe('PREREQ-API-ID');
    });

    it('should fail when x-api-id has invalid format', () => {
      const spec = {
        info: {
          title: 'Test API',
          version: '1.0.0',
          'x-api-id': 'invalid-format'
        }
      };

      const result = checkApiId(spec);
      
      expect(result.passed).toBe(false);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].ruleId).toBe('PREREQ-API-ID-FORMAT');
      expect(result.failures[0].message).toContain('Invalid x-api-id format');
    });

    it('should fail when x-api-id has wrong timestamp length', () => {
      const spec = {
        info: {
          title: 'Test API',
          version: '1.0.0',
          'x-api-id': 'acme_123_a3f8b2c9d4e5f6a7' // timestamp too short
        }
      };

      const result = checkApiId(spec);
      
      expect(result.passed).toBe(false);
      expect(result.failures[0].ruleId).toBe('PREREQ-API-ID-FORMAT');
    });

    it('should fail when x-api-id has invalid hex characters', () => {
      const spec = {
        info: {
          title: 'Test API',
          version: '1.0.0',
          'x-api-id': 'acme_1736180423567_xyz123notvalidhex' // invalid hex
        }
      };

      const result = checkApiId(spec);
      
      expect(result.passed).toBe(false);
      expect(result.failures[0].ruleId).toBe('PREREQ-API-ID-FORMAT');
    });

    it('should fail when x-api-id has uppercase characters', () => {
      const spec = {
        info: {
          title: 'Test API',
          version: '1.0.0',
          'x-api-id': 'ACME_1736180423567_A3F8B2C9D4E5F6A7' // uppercase not allowed
        }
      };

      const result = checkApiId(spec);
      
      expect(result.passed).toBe(false);
      expect(result.failures[0].ruleId).toBe('PREREQ-API-ID-FORMAT');
    });

    it('should include fix hint in failure message', () => {
      const spec = {
        info: {
          title: 'Test API',
          version: '1.0.0'
        }
      };

      const result = checkApiId(spec);
      
      expect(result.failures[0].fixHint).toBeDefined();
      expect(result.failures[0].fixHint).toContain('generate_api_id');
    });

    it('should set correct location for missing x-api-id', () => {
      const spec = {
        info: {
          title: 'Test API',
          version: '1.0.0'
        }
      };

      const result = checkApiId(spec);
      
      expect(result.failures[0].location).toBe('$.info');
    });

    it('should set correct location for invalid format', () => {
      const spec = {
        info: {
          title: 'Test API',
          version: '1.0.0',
          'x-api-id': 'invalid'
        }
      };

      const result = checkApiId(spec);
      
      expect(result.failures[0].location).toBe('$.info.x-api-id');
    });

    it('should accept various valid organization prefixes', () => {
      const validIds = [
        'a_1736180423567_a3f8b2c9d4e5f6a7', // single letter
        'api123_1736180423567_a3f8b2c9d4e5f6a7', // alphanumeric
        '123org_1736180423567_a3f8b2c9d4e5f6a7', // starting with numbers
      ];

      for (const id of validIds) {
        const spec = {
          info: {
            title: 'Test API',
            version: '1.0.0',
            'x-api-id': id
          }
        };

        const result = checkApiId(spec);
        expect(result.passed).toBe(true);
      }
    });
  });
});
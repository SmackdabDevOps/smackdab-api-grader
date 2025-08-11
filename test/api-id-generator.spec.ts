import { describe, it, expect } from '@jest/globals';
import {
  generateApiId,
  validateApiIdFormat,
  extractApiIdMetadata,
  getApiIdInstructions,
  generateApiIdWithLineage
} from '../src/mcp/tools/api-id-generator.js';

describe('API ID Generator', () => {
  describe('generateApiId', () => {
    it('should generate ID with default prefix when no metadata provided', () => {
      const id = generateApiId();
      expect(id).toMatch(/^api_\d{13}_[a-f0-9]{16}$/);
    });

    it('should use organization prefix when provided', () => {
      const id = generateApiId({ organization: 'acme' });
      expect(id).toMatch(/^acme_\d{13}_[a-f0-9]{16}$/);
    });

    it('should generate unique IDs on each call', () => {
      const id1 = generateApiId();
      const id2 = generateApiId();
      expect(id1).not.toBe(id2);
    });

    it('should include current timestamp', () => {
      const before = Date.now();
      const id = generateApiId();
      const after = Date.now();
      
      const parts = id.split('_');
      const timestamp = parseInt(parts[1], 10);
      
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('validateApiIdFormat', () => {
    it('should validate correct format', () => {
      const validId = 'acme_1736180423567_a3f8b2c9d4e5f6a7';
      expect(validateApiIdFormat(validId)).toBe(true);
    });

    it('should reject invalid formats', () => {
      expect(validateApiIdFormat('invalid')).toBe(false);
      expect(validateApiIdFormat('acme_123_abc')).toBe(false); // timestamp too short
      expect(validateApiIdFormat('acme_1736180423567_xyz')).toBe(false); // invalid hex
      expect(validateApiIdFormat('ACME_1736180423567_a3f8b2c9d4e5f6a7')).toBe(false); // uppercase
    });

    it('should reject IDs with wrong number of parts', () => {
      expect(validateApiIdFormat('acme_1736180423567')).toBe(false);
      expect(validateApiIdFormat('acme_1736180423567_a3f8b2c9d4e5f6a7_extra')).toBe(false);
    });
  });

  describe('extractApiIdMetadata', () => {
    it('should extract metadata from valid ID', () => {
      const id = 'acme_1736180423567_a3f8b2c9d4e5f6a7';
      const metadata = extractApiIdMetadata(id);
      
      expect(metadata).not.toBeNull();
      expect(metadata?.organization).toBe('acme');
      expect(metadata?.timestamp).toBe(1736180423567);
      expect(metadata?.randomPart).toBe('a3f8b2c9d4e5f6a7');
      expect(metadata?.createdAt).toBeInstanceOf(Date);
    });

    it('should return null for invalid ID', () => {
      expect(extractApiIdMetadata('invalid')).toBeNull();
      expect(extractApiIdMetadata('acme_notanumber_abc')).toBeNull();
    });
  });

  describe('getApiIdInstructions', () => {
    it('should generate instructions with the provided ID', () => {
      const id = 'test_1234567890123_abcdef0123456789';
      const instructions = getApiIdInstructions(id);
      
      expect(instructions).toContain(id);
      expect(instructions).toContain('x-api-id:');
      expect(instructions).toContain('openapi: 3.0.3');
      expect(instructions).toContain('x-api-created:');
    });

    it('should include current date in instructions', () => {
      const id = 'test_1234567890123_abcdef0123456789';
      const instructions = getApiIdInstructions(id);
      const today = new Date().toISOString().split('T')[0];
      
      expect(instructions).toContain(today);
    });
  });

  describe('generateApiIdWithLineage', () => {
    it('should generate new ID without lineage when no parent provided', () => {
      const result = generateApiIdWithLineage(undefined);
      
      expect(result.apiId).toMatch(/^api_\d{13}_[a-f0-9]{16}$/);
      expect(result.lineage).toBeUndefined();
    });

    it('should include lineage when parent ID provided', () => {
      const parentId = 'parent_1234567890123_abcdef0123456789';
      const result = generateApiIdWithLineage(parentId, { forkReason: 'Feature branch' });
      
      expect(result.apiId).toMatch(/^api_\d{13}_[a-f0-9]{16}$/);
      expect(result.lineage).toBeDefined();
      expect(result.lineage?.parentId).toBe(parentId);
      expect(result.lineage?.forkReason).toBe('Feature branch');
    });

    it('should use organization from metadata even with parent', () => {
      const parentId = 'parent_1234567890123_abcdef0123456789';
      const result = generateApiIdWithLineage(parentId, { organization: 'child' });
      
      expect(result.apiId).toMatch(/^child_\d{13}_[a-f0-9]{16}$/);
    });
  });
});
import { describe, it, expect, jest } from '@jest/globals';

// Mock fs/promises before importing the module
jest.mock('node:fs/promises', () => ({
  readFile: jest.fn((path, encoding) => {
    // Return appropriate content based on encoding
    if (encoding === 'utf-8' || encoding === 'utf8') {
      return Promise.resolve('test content');
    }
    return Promise.resolve(Buffer.from('test content'));
  }),
  writeFile: jest.fn(() => Promise.resolve(undefined))
}));

// Mock crypto (both node:crypto and crypto imports)
jest.mock('crypto', () => ({
  default: {
    createHash: jest.fn(() => ({
      update: jest.fn().mockReturnThis(),
      digest: jest.fn(() => 'test-hash')
    }))
  },
  createHash: jest.fn(() => ({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn(() => 'test-hash')
  }))
}));

jest.mock('node:crypto', () => ({
  default: {
    createHash: jest.fn(() => ({
      update: jest.fn().mockReturnThis(),
      digest: jest.fn(() => 'test-hash')
    }))
  },
  createHash: jest.fn(() => ({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn(() => 'test-hash')
  }))
}));

describe('applyPatches simple tests', () => {
  it('should load the module', async () => {
    const module = await import('../../../../src/app/patching/applyPatches.js');
    expect(module.applyPatches).toBeDefined();
    expect(typeof module.applyPatches).toBe('function');
  });

  it('should handle empty patches', async () => {
    const { applyPatches } = await import('../../../../src/app/patching/applyPatches.js');
    const result = await applyPatches('/test/file.yaml', []);
    
    expect(result).toEqual({
      applied: 0,
      dryRun: true,
      changed: false
    });
  });

  it('should handle dry run mode', async () => {
    const { applyPatches } = await import('../../../../src/app/patching/applyPatches.js');
    const patches = [{
      type: 'unified-diff' as const,
      preimageHash: 'test-hash',
      body: '--- a/test\n+++ b/test\n@@\n- old\n+ new'
    }];
    
    const result = await applyPatches('/test/file.yaml', patches, true);
    
    expect(result.dryRun).toBe(true);
  });

  it('should validate preimage hash', async () => {
    const { applyPatches } = await import('../../../../src/app/patching/applyPatches.js');
    const patches = [{
      type: 'unified-diff' as const,
      preimageHash: 'wrong-hash',
      body: '--- a/test\n+++ b/test\n@@\n- old\n+ new'
    }];
    
    await expect(applyPatches('/test/file.yaml', patches)).rejects.toThrow('Preimage hash mismatch');
  });
});
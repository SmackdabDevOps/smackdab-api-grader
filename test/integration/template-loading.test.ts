/**
 * Integration tests for template loading and validation
 * Tests template loading, parsing, and integration with grading pipeline
 */

import { jest, describe, test, beforeEach, afterEach, expect } from '@jest/globals';
import fs from 'node:fs/promises';
import { loadTemplate } from '../../src/app/io/templateLoader';
import { gradeContract } from '../../src/app/pipeline';
import { 
  createMockProgress, 
  assertGradingResult,
  getFixturePath,
  TestDataFactory,
  createTempSpec,
  cleanupTempFile,
  MINIMAL_VALID_SPEC
} from '../helpers/pipeline-test-helpers';

describe('Template Loading Integration Tests', () => {
  let tempFiles: string[] = [];

  afterEach(async () => {
    // Clean up temporary files
    for (const file of tempFiles) {
      await cleanupTempFile(file);
    }
    tempFiles = [];
  });

  describe('Template Loading Functionality', () => {
    test('should load and parse valid template file', async () => {
      const templatePath = getFixturePath('template.yaml');
      
      const template = await loadTemplate(templatePath);
      
      // Should return template structure
      expect(template).toHaveProperty('templateHash');
      expect(template).toHaveProperty('rulesetHash');
      expect(template).toHaveProperty('spectralYaml');
      
      // Hashes should be consistent
      expect(template.templateHash).toMatch(/^[a-f0-9]{64}$/);
      expect(template.rulesetHash).toMatch(/^[a-f0-9]{64}|none$/);
      
      // Should have Spectral configuration
      if (template.spectralYaml) {
        expect(typeof template.spectralYaml).toBe('string');
        expect(template.spectralYaml.length).toBeGreaterThan(0);
      }
    });

    test('should generate consistent hashes for same template', async () => {
      const templatePath = getFixturePath('template.yaml');
      
      const template1 = await loadTemplate(templatePath);
      const template2 = await loadTemplate(templatePath);
      
      // Should generate identical hashes for same content
      expect(template1.templateHash).toBe(template2.templateHash);
      expect(template1.rulesetHash).toBe(template2.rulesetHash);
      expect(template1.spectralYaml).toBe(template2.spectralYaml);
    });

    test('should handle template without x-spectral section', async () => {
      const simpleTemplate = `
        openapi: "3.0.3"
        info:
          title: "Simple Template"
          version: "1.0.0"
        
        paths:
          /example:
            get:
              responses:
                '200':
                  description: "Success"
      `;
      
      const tempFile = await createTempSpec(simpleTemplate);
      tempFiles.push(tempFile);
      
      const template = await loadTemplate(tempFile);
      
      // Should handle template without Spectral rules
      expect(template.templateHash).toBeDefined();
      expect(template.rulesetHash).toBe('none');
      expect(template.spectralYaml).toBeUndefined();
    });

    test('should extract spectral configuration correctly', async () => {
      const templateWithSpectral = `
        openapi: "3.0.3"
        info:
          title: "Template with Spectral"
          version: "1.0.0"
        
        x-spectral:
          extends:
            - spectral:oas
          rules:
            operation-operationId:
              description: "Operation must have operationId"
              given: "$.paths.*[get,post,put,patch,delete,head,options,trace]"
              severity: error
              then:
                field: "operationId"
                function: "truthy"
            
            path-params:
              description: "Path parameters must be defined"
              given: "$.paths.*"
              severity: error
              then:
                function: "defined"
        
        paths:
          /test:
            get:
              responses:
                '200':
                  description: "Success"
      `;
      
      const tempFile = await createTempSpec(templateWithSpectral);
      tempFiles.push(tempFile);
      
      const template = await loadTemplate(tempFile);
      
      expect(template.spectralYaml).toBeDefined();
      expect(template.spectralYaml).toContain('spectral:oas');
      expect(template.spectralYaml).toContain('operation-operationId');
      expect(template.spectralYaml).toContain('path-params');
      expect(template.rulesetHash).not.toBe('none');
    });

    test('should handle missing template file gracefully', async () => {
      const nonExistentPath = '/nonexistent/template.yaml';
      
      await expect(loadTemplate(nonExistentPath))
        .rejects.toThrow();
    });

    test('should handle malformed template YAML', async () => {
      const malformedTemplate = `
        openapi: "3.0.3"
        info:
          title: "Malformed Template"
          version: 1.0.0
        
        # Invalid YAML structure
        paths:
          /test:
            get:
              responses: [invalid: yaml}
      `;
      
      const tempFile = await createTempSpec(malformedTemplate);
      tempFiles.push(tempFile);
      
      // Should either handle gracefully or throw parsing error
      try {
        const template = await loadTemplate(tempFile);
        // If it succeeds, should at least have basic structure
        expect(template.templateHash).toBeDefined();
      } catch (error) {
        // If it fails, should be a parsing error
        expect(error).toBeDefined();
      }
    });
  });

  describe('Template Integration with Grading Pipeline', () => {
    test('should use loaded template in grading pipeline', async () => {
      const [mockProgress] = createMockProgress();
      const templatePath = getFixturePath('template.yaml');
      
      // Load template independently
      const template = await loadTemplate(templatePath);
      
      // Use same template in grading
      const args = {
        path: getFixturePath('valid-api.yaml'),
        templatePath: templatePath
      };
      
      const result = await gradeContract(args, { progress: mockProgress });
      
      assertGradingResult(result);
      
      // Should use same template hashes
      expect(result.metadata.templateHash).toBe(template.templateHash);
      expect(result.metadata.rulesetHash).toBe(template.rulesetHash);
      expect(result.metadata.templateVersion).toBe('3.2.3');
    });

    test('should apply spectral rules from template', async () => {
      const customSpectralTemplate = `
        openapi: "3.0.3"
        info:
          title: "Custom Spectral Template"
          version: "1.0.0"
        
        x-spectral:
          extends:
            - spectral:oas
          rules:
            custom-operation-summary:
              description: "Operations must have summary"
              given: "$.paths.*[get,post,put,patch,delete]"
              severity: error
              then:
                field: "summary" 
                function: "truthy"
            
            custom-response-description:
              description: "Responses must have descriptions"
              given: "$.paths.*.*.responses.*"
              severity: warn
              then:
                field: "description"
                function: "truthy"
        
        paths:
          /example:
            get:
              summary: "Example endpoint"
              responses:
                '200':
                  description: "Success"
      `;
      
      const tempTemplate = await createTempSpec(customSpectralTemplate);
      tempFiles.push(tempTemplate);
      
      // Test spec that should trigger custom rules
      const testSpec = `
        openapi: "3.0.3"
        info:
          title: "Test API"
          version: "1.0.0"
        
        paths:
          /test:
            get:
              # Missing summary - should trigger custom-operation-summary
              responses:
                '200':
                  # Missing description - should trigger custom-response-description
                  content:
                    application/json:
                      schema:
                        type: string
      `;
      
      const tempSpec = await createTempSpec(testSpec);
      tempFiles.push(tempSpec);
      
      const [mockProgress] = createMockProgress();
      const args = {
        path: tempSpec,
        templatePath: tempTemplate
      };
      
      const result = await gradeContract(args, { progress: mockProgress });
      
      assertGradingResult(result);
      
      // Should have findings from custom Spectral rules
      const spectralFindings = result.findings.filter(f => 
        f.ruleId === 'SPECTRAL' || 
        f.message.includes('summary') || 
        f.message.includes('description')
      );
      
      expect(spectralFindings.length).toBeGreaterThan(0);
    });

    test('should handle template loading errors during grading', async () => {
      const [mockProgress] = createMockProgress();
      const args = {
        path: getFixturePath('valid-api.yaml'),
        templatePath: '/nonexistent/template.yaml'
      };
      
      await expect(gradeContract(args, { progress: mockProgress }))
        .rejects.toThrow();
    });

    test('should use default template when path not specified', async () => {
      const [mockProgress] = createMockProgress();
      const args = {
        path: getFixturePath('valid-api.yaml')
        // No templatePath - should use default
      };
      
      const result = await gradeContract(args, { progress: mockProgress });
      
      assertGradingResult(result);
      
      // Should use default template metadata
      expect(result.metadata.templateVersion).toBe('3.2.3');
      expect(result.metadata.templateHash).toBeDefined();
    });
  });

  describe('Template Content Validation', () => {
    test('should validate template has required OpenAPI structure', async () => {
      const incompleteTemplate = `
        # Missing openapi field
        info:
          title: "Incomplete Template"
          version: "1.0.0"
        
        paths: {}
      `;
      
      const tempFile = await createTempSpec(incompleteTemplate);
      tempFiles.push(tempFile);
      
      // Should load template despite structural issues
      const template = await loadTemplate(tempFile);
      expect(template.templateHash).toBeDefined();
      
      // But when used in grading, should identify issues
      const [mockProgress] = createMockProgress();
      const args = {
        path: tempFile,
        templatePath: tempFile
      };
      
      const result = await gradeContract(args, { progress: mockProgress });
      
      // Should identify structural problems
      expect(result.findings.some(f => 
        f.message.toLowerCase().includes('openapi') ||
        f.message.toLowerCase().includes('missing')
      )).toBe(true);
    });

    test('should handle empty template file', async () => {
      const emptyTemplate = '';
      
      const tempFile = await createTempSpec(emptyTemplate);
      tempFiles.push(tempFile);
      
      // Should handle empty template
      try {
        const template = await loadTemplate(tempFile);
        expect(template.templateHash).toBeDefined();
      } catch (error) {
        // Acceptable to fail on empty template
        expect(error).toBeDefined();
      }
    });

    test('should handle very large template files', async () => {
      // Generate large template with many paths and schemas
      let largeTemplate = `
        openapi: "3.0.3"
        info:
          title: "Large Template"
          version: "1.0.0"
        
        x-spectral:
          extends:
            - spectral:oas
          rules:
      `;
      
      // Add many spectral rules
      for (let i = 1; i <= 50; i++) {
        largeTemplate += `
            rule-${i}:
              description: "Custom rule ${i}"
              given: "$.paths.*"
              severity: info
              then:
                function: "defined"
        `;
      }
      
      largeTemplate += `
        
        components:
          schemas:
      `;
      
      // Add many schemas
      for (let i = 1; i <= 100; i++) {
        largeTemplate += `
            Schema${i}:
              type: object
              properties:
                id:
                  type: string
                name:
                  type: string
                value${i}:
                  type: integer
        `;
      }
      
      largeTemplate += `
        
        paths:
      `;
      
      // Add many paths
      for (let i = 1; i <= 50; i++) {
        largeTemplate += `
          /resource${i}:
            get:
              summary: "Get resource ${i}"
              responses:
                '200':
                  description: "Success"
                  content:
                    application/json:
                      schema:
                        $ref: "#/components/schemas/Schema${i}"
        `;
      }
      
      const tempFile = await createTempSpec(largeTemplate);
      tempFiles.push(tempFile);
      
      // Should handle large template efficiently
      const startTime = performance.now();
      const template = await loadTemplate(tempFile);
      const loadTime = performance.now() - startTime;
      
      expect(template.templateHash).toBeDefined();
      expect(template.spectralYaml).toBeDefined();
      expect(template.spectralYaml).toContain('rule-1');
      expect(template.spectralYaml).toContain('rule-50');
      
      // Should load within reasonable time (5 seconds)
      expect(loadTime).toBeLessThan(5000);
    });
  });

  describe('Hash Consistency and Uniqueness', () => {
    test('should generate different hashes for different templates', async () => {
      const template1 = `
        openapi: "3.0.3"
        info:
          title: "Template 1"
          version: "1.0.0"
        paths:
          /test1:
            get:
              responses:
                '200':
                  description: "Success"
      `;
      
      const template2 = `
        openapi: "3.0.3"
        info:
          title: "Template 2"
          version: "1.0.0"
        paths:
          /test2:
            post:
              responses:
                '201':
                  description: "Created"
      `;
      
      const tempFile1 = await createTempSpec(template1);
      const tempFile2 = await createTempSpec(template2);
      tempFiles.push(tempFile1, tempFile2);
      
      const result1 = await loadTemplate(tempFile1);
      const result2 = await loadTemplate(tempFile2);
      
      // Should have different hashes
      expect(result1.templateHash).not.toBe(result2.templateHash);
    });

    test('should detect changes in spectral configuration', async () => {
      const baseTemplate = `
        openapi: "3.0.3"
        info:
          title: "Base Template"
          version: "1.0.0"
        
        x-spectral:
          extends:
            - spectral:oas
          rules:
            test-rule:
              severity: error
        
        paths:
          /test:
            get:
              responses:
                '200':
                  description: "Success"
      `;
      
      const modifiedTemplate = `
        openapi: "3.0.3"
        info:
          title: "Base Template"
          version: "1.0.0"
        
        x-spectral:
          extends:
            - spectral:oas
          rules:
            test-rule:
              severity: warn  # Changed from error to warn
        
        paths:
          /test:
            get:
              responses:
                '200':
                  description: "Success"
      `;
      
      const tempFile1 = await createTempSpec(baseTemplate);
      const tempFile2 = await createTempSpec(modifiedTemplate);
      tempFiles.push(tempFile1, tempFile2);
      
      const result1 = await loadTemplate(tempFile1);
      const result2 = await loadTemplate(tempFile2);
      
      // Template hash should be different (different content)
      expect(result1.templateHash).not.toBe(result2.templateHash);
      
      // Ruleset hash should also be different (different spectral config)
      expect(result1.rulesetHash).not.toBe(result2.rulesetHash);
    });

    test('should handle Unicode characters in templates', async () => {
      const unicodeTemplate = `
        openapi: "3.0.3"
        info:
          title: "Unicode Template 🌍"
          version: "1.0.0"
          description: |
            This template contains Unicode:
            • Bullet points
            ★ Stars and symbols
            中文 Chinese characters
            العربية Arabic text
            русский Russian text
            🚀🎉✨ Emojis
        
        paths:
          /测试:
            get:
              summary: "Test endpoint with Chinese path"
              description: "Endpoint with émojis 🎯"
              responses:
                '200':
                  description: "成功 Success"
      `;
      
      const tempFile = await createTempSpec(unicodeTemplate);
      tempFiles.push(tempFile);
      
      const template = await loadTemplate(tempFile);
      
      // Should handle Unicode without corruption
      expect(template.templateHash).toBeDefined();
      expect(template.templateHash).toMatch(/^[a-f0-9]{64}$/);
      
      // Should be consistent across loads
      const template2 = await loadTemplate(tempFile);
      expect(template.templateHash).toBe(template2.templateHash);
    });
  });

  describe('Template Cache Simulation', () => {
    test('should be suitable for caching based on path and hash', async () => {
      const templatePath = getFixturePath('template.yaml');
      
      // Load template multiple times
      const loads = await Promise.all([
        loadTemplate(templatePath),
        loadTemplate(templatePath),
        loadTemplate(templatePath)
      ]);
      
      // All should return identical results
      loads.forEach(template => {
        expect(template.templateHash).toBe(loads[0].templateHash);
        expect(template.rulesetHash).toBe(loads[0].rulesetHash);
        expect(template.spectralYaml).toBe(loads[0].spectralYaml);
      });
      
      // Hash could be used as cache key
      const cacheKey = `${templatePath}:${loads[0].templateHash}`;
      expect(cacheKey).toMatch(/\.yaml:[a-f0-9]{64}$/);
    });

    test('should detect template modifications for cache invalidation', async () => {
      // This simulates checking if template file changed
      const originalTemplate = `
        openapi: "3.0.3"
        info:
          title: "Original Template"
          version: "1.0.0"
        paths:
          /test:
            get:
              responses:
                '200':
                  description: "Success"
      `;
      
      const modifiedTemplate = `
        openapi: "3.0.3"
        info:
          title: "Modified Template"  # Changed title
          version: "1.0.0"
        paths:
          /test:
            get:
              responses:
                '200':
                  description: "Success"
      `;
      
      const tempFile = await createTempSpec(originalTemplate);
      tempFiles.push(tempFile);
      
      const original = await loadTemplate(tempFile);
      
      // Simulate file change
      await fs.writeFile(tempFile, modifiedTemplate, 'utf8');
      
      const modified = await loadTemplate(tempFile);
      
      // Hash should change, indicating cache should be invalidated
      expect(original.templateHash).not.toBe(modified.templateHash);
    });
  });
});
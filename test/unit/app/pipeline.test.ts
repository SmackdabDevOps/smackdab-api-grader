/**
 * Pipeline Module Unit Tests - RED PHASE
 * These tests will initially FAIL as they test core functionality
 * Following TDD: Write failing tests to define expected behavior for grading pipeline
 */

import * as pipeline from '../../../src/app/pipeline';
import { MockOpenApiFactory, MockGradingResultFactory, MockGradeFactory } from '../../helpers/mock-factories';
import fs from 'node:fs/promises';
import { jest } from '@jest/globals';

// Mock external dependencies
jest.mock('node:fs/promises');
jest.mock('yaml');
jest.mock('../../../src/app/linters/openapiValidator.js');
jest.mock('../../../src/app/linters/spectralRunner.js');
jest.mock('../../../src/app/linters/examplesValidator.js');
jest.mock('../../../src/app/io/templateLoader.js');

const mockFs = fs as jest.Mocked<typeof fs>;

describe('Pipeline Version Management', () => {
  describe('version()', () => {
    test('should return coverage-based scoring version by default', async () => {
      // RED PHASE: Test default scoring system version
      delete process.env.USE_LEGACY_SCORING;
      
      const versionInfo = await pipeline.version();
      
      expect(versionInfo.serverVersion).toBe('2.0.0');
      expect(versionInfo.scoringEngine).toBe('coverage-based');
      expect(versionInfo.toolVersions.grader).toBe('2.0.0');
      expect(versionInfo.toolVersions.scoringSystem).toBe('coverage-based-v1');
    });

    test('should return legacy scoring version when explicitly enabled', async () => {
      // RED PHASE: Test legacy mode
      process.env.USE_LEGACY_SCORING = 'true';
      
      const versionInfo = await pipeline.version();
      
      expect(versionInfo.serverVersion).toBe('1.2.0');
      expect(versionInfo.scoringEngine).toBe('legacy');
      expect(versionInfo.toolVersions.grader).toBe('1.2.0');
      expect(versionInfo.toolVersions.scoringSystem).toBe('legacy-binary');
      
      delete process.env.USE_LEGACY_SCORING;
    });

    test('should include instance tracking information', async () => {
      // RED PHASE: Test instance identification
      const versionInfo = await pipeline.version();
      
      expect(versionInfo.instanceId).toMatch(/^[a-f0-9]{8}$/);
      expect(versionInfo.instanceStartTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.*Z$/);
      expect(versionInfo.rulesetHash).toBe('dev-hash');
      expect(versionInfo.templateVersion).toBe('3.2.3');
      expect(versionInfo.templateHash).toBe('dev-template');
    });
  });
});

describe('Pipeline Contract Grading - Coverage-Based System', () => {
  beforeEach(() => {
    // Ensure we're testing the new scoring system
    delete process.env.USE_LEGACY_SCORING;
    
    // Mock file system operations
    mockFs.readFile.mockResolvedValue('mock yaml content');
    
    // Mock template loader
    const mockTemplate = {
      spectralYaml: 'mock spectral rules',
      templateHash: 'mock-template-hash',
      rulesetHash: 'mock-ruleset-hash'
    };
    jest.doMock('../../../src/app/io/templateLoader.js', () => ({
      loadTemplate: jest.fn().mockResolvedValue(mockTemplate)
    }));
  });

  describe('gradeContract() - Prerequisites Phase', () => {
    test('should check prerequisites before grading', async () => {
      // RED PHASE: Test prerequisite validation
      const spec = MockOpenApiFactory.validMinimal();
      
      // Mock YAML parsing
      jest.doMock('yaml', () => ({
        parseDocument: jest.fn().mockReturnValue({
          toJS: () => spec,
          keepNodeTypes: true
        })
      }));
      
      // Mock prerequisite checker to fail
      jest.doMock('../../../src/scoring/prerequisites.js', () => ({
        checkPrerequisites: jest.fn().mockResolvedValue({
          passed: false,
          failures: [
            {
              ruleId: 'OPENAPI-VERSION',
              message: 'OpenAPI version must be 3.0.3',
              severity: 'error',
              location: '$.openapi',
              category: 'structure',
              line: 1
            }
          ]
        })
      }));
      
      const progressMock = jest.fn();
      
      const result = await pipeline.gradeContract(
        { path: '/test/invalid.yaml' },
        { progress: progressMock }
      );
      
      // Should return blocked result
      expect(result.grade.total).toBe(0);
      expect(result.grade.letter).toBe('F');
      expect(result.grade.blockedByPrerequisites).toBe(true);
      expect(result.grade.prerequisiteFailures).toBe(1);
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].ruleId).toBe('OPENAPI-VERSION');
    });

    test('should proceed to full grading when prerequisites pass', async () => {
      // RED PHASE: Test successful prerequisite validation
      const spec = MockOpenApiFactory.validWithTenancy();
      
      // Mock successful prerequisites
      jest.doMock('../../../src/scoring/prerequisites.js', () => ({
        checkPrerequisites: jest.fn().mockResolvedValue({
          passed: true,
          failures: []
        })
      }));
      
      // Mock scoring components
      jest.doMock('../../../src/scoring/dependencies.js', () => ({
        scoreWithDependencies: jest.fn().mockReturnValue(new Map([
          ['TENANCY-PATTERNS', {
            coverage: 0.9,
            score: 18,
            maxScore: 20,
            category: 'tenancy',
            applicable: true,
            targetsChecked: 10,
            targetsPassed: 9
          }]
        ]))
      }));
      
      jest.doMock('../../../src/scoring/finalizer.js', () => ({
        calculateFinalGrade: jest.fn().mockReturnValue({
          score: 90,
          grade: 'A-',
          excellence: false,
          criticalFindings: 0,
          findings: [],
          breakdown: [
            {
              category: 'tenancy',
              earnedPoints: 18,
              maxPoints: 20,
              percentage: 0.9
            }
          ]
        })
      }));
      
      const progressMock = jest.fn();
      
      const result = await pipeline.gradeContract(
        { path: '/test/valid.yaml' },
        { progress: progressMock }
      );
      
      expect(result.grade.total).toBe(90);
      expect(result.grade.letter).toBe('A-');
      expect(result.grade.coverageBased).toBe(true);
      expect(result.grade.blockedByPrerequisites).toBeUndefined();
    });
  });

  describe('gradeContract() - Legacy Auto-fail Handling', () => {
    test('should handle OpenAPI version auto-fail in legacy mode', async () => {
      // RED PHASE: Test legacy auto-fail behavior
      process.env.USE_LEGACY_SCORING = 'true';
      
      // Mock OpenAPI validator to return version error
      jest.doMock('../../../src/app/linters/openapiValidator.js', () => ({
        validateOpenAPI: jest.fn().mockResolvedValue({
          errors: [
            {
              message: 'OpenAPI version must be 3.0.3',
              path: '$.openapi'
            }
          ],
          warnings: []
        })
      }));
      
      const progressMock = jest.fn();
      
      const result = await pipeline.gradeContract(
        { path: '/test/invalid.yaml', legacyMode: true },
        { progress: progressMock }
      );
      
      expect(result.grade.total).toBe(0);
      expect(result.grade.letter).toBe('F');
      expect(result.grade.autoFailTriggered).toBe(true);
      expect(result.grade.autoFailReasons).toContain('OpenAPI version not 3.0.3');
      
      delete process.env.USE_LEGACY_SCORING;
    });
  });

  describe('gradeContract() - Semantic Analysis Integration', () => {
    test('should run all semantic analysis modules', async () => {
      // RED PHASE: Test comprehensive semantic analysis
      const spec = MockOpenApiFactory.validWithTenancy();
      
      // Mock all semantic modules
      const mockSemanticResult = {
        findings: [
          {
            ruleId: 'TENANCY-PATH',
            message: 'Path follows tenancy pattern',
            severity: 'info',
            jsonPath: '$.paths["/organizations/{organizationId}/users"]'
          }
        ],
        score: { tenancy: { add: 20 } }
      };
      
      jest.doMock('../../../src/app/semantic/comprehensive.js', () => ({
        checkComprehensive: jest.fn().mockResolvedValue(mockSemanticResult)
      }));
      
      jest.doMock('../../../src/app/semantic/tenancy.js', () => ({
        checkTenancy: jest.fn().mockResolvedValue(mockSemanticResult)
      }));
      
      // Mock prerequisites to pass
      jest.doMock('../../../src/scoring/prerequisites.js', () => ({
        checkPrerequisites: jest.fn().mockResolvedValue({
          passed: true,
          failures: []
        })
      }));
      
      const progressMock = jest.fn();
      
      const result = await pipeline.gradeContract(
        { path: '/test/valid.yaml' },
        { progress: progressMock }
      );
      
      // Should call progress with semantic analysis stage
      expect(progressMock).toHaveBeenCalledWith('coverage-scoring', 80);
      expect(progressMock).toHaveBeenCalledWith('done', 100);
    });

    test('should handle semantic analysis errors gracefully', async () => {
      // RED PHASE: Test error handling in semantic analysis
      jest.doMock('../../../src/app/semantic/tenancy.js', () => ({
        checkTenancy: jest.fn().mockRejectedValue(new Error('Tenancy analysis failed'))
      }));
      
      const progressMock = jest.fn();
      
      // Should not throw but should handle the error
      await expect(
        pipeline.gradeContract(
          { path: '/test/valid.yaml' },
          { progress: progressMock }
        )
      ).rejects.toThrow('Tenancy analysis failed');
    });
  });

  describe('gradeContract() - Template Integration', () => {
    test('should use default template when none provided', async () => {
      // RED PHASE: Test default template behavior
      const progressMock = jest.fn();
      
      await pipeline.gradeContract(
        { path: '/test/valid.yaml' },
        { progress: progressMock }
      );
      
      // Should load the default template
      const templateLoader = await import('../../../src/app/io/templateLoader.js');
      expect(templateLoader.loadTemplate).toHaveBeenCalledWith(
        '.claude/templates/MASTER_API_TEMPLATE_v3.yaml'
      );
    });

    test('should use custom template when provided', async () => {
      // RED PHASE: Test custom template usage
      const customTemplatePath = '/custom/template.yaml';
      const progressMock = jest.fn();
      
      await pipeline.gradeContract(
        { path: '/test/valid.yaml', templatePath: customTemplatePath },
        { progress: progressMock }
      );
      
      const templateLoader = await import('../../../src/app/io/templateLoader.js');
      expect(templateLoader.loadTemplate).toHaveBeenCalledWith(customTemplatePath);
    });
  });

  describe('gradeContract() - Result Structure', () => {
    test('should return complete grading result with all required fields', async () => {
      // RED PHASE: Test complete result structure
      const result = MockGradingResultFactory.passingResult();
      
      // Mock the complete pipeline
      jest.doMock('../../../src/scoring/prerequisites.js', () => ({
        checkPrerequisites: jest.fn().mockResolvedValue({ passed: true, failures: [] })
      }));
      
      const progressMock = jest.fn();
      
      const gradingResult = await pipeline.gradeContract(
        { path: '/test/valid.yaml' },
        { progress: progressMock }
      );
      
      // Should have all required top-level fields
      expect(gradingResult).toHaveProperty('grade');
      expect(gradingResult).toHaveProperty('findings');
      expect(gradingResult).toHaveProperty('checkpoints');
      expect(gradingResult).toHaveProperty('metadata');
      
      // Grade should have required fields
      expect(gradingResult.grade).toHaveProperty('total');
      expect(gradingResult.grade).toHaveProperty('letter');
      expect(gradingResult.grade).toHaveProperty('compliancePct');
      expect(gradingResult.grade).toHaveProperty('autoFailTriggered');
      expect(gradingResult.grade).toHaveProperty('criticalIssues');
      expect(gradingResult.grade).toHaveProperty('perCategory');
      
      // Metadata should include version tracking
      expect(gradingResult.metadata).toHaveProperty('instanceId');
      expect(gradingResult.metadata).toHaveProperty('instanceStartTime');
      expect(gradingResult.metadata).toHaveProperty('gradedAt');
    });

    test('should sort findings in stable order', async () => {
      // RED PHASE: Test findings ordering
      const mockFindings = [
        { ruleId: 'B', severity: 'warn', category: 'naming', jsonPath: '$.info', line: 5 },
        { ruleId: 'A', severity: 'error', category: 'tenancy', jsonPath: '$.paths', line: 10 },
        { ruleId: 'C', severity: 'info', category: 'naming', jsonPath: '$.info', line: 3 }
      ];
      
      // Mock the pipeline to return these findings
      const progressMock = jest.fn();
      
      const result = await pipeline.gradeContract(
        { path: '/test/valid.yaml' },
        { progress: progressMock }
      );
      
      // Findings should be sorted by: severity (error < warn < info), category, ruleId, jsonPath, line
      expect(result.findings[0].severity).toBe('error'); // Errors first
      if (result.findings.length > 1) {
        expect(result.findings[1].severity).toBe('warn'); // Then warnings
      }
    });
  });
});

describe('Pipeline Inline Grading', () => {
  describe('gradeInline()', () => {
    test('should create temporary file and grade inline content', async () => {
      // RED PHASE: Test inline content grading
      const yamlContent = `
openapi: "3.0.3"
info:
  title: "Test API"
  version: "1.0.0"
paths: {}
`;
      
      const mockResult = MockGradingResultFactory.passingResult();
      
      // Mock gradeContract to return expected result
      jest.spyOn(pipeline, 'gradeContract').mockResolvedValue(mockResult);
      
      const progressMock = jest.fn();
      
      const result = await pipeline.gradeInline(
        { content: yamlContent, templatePath: '/custom/template.yaml' },
        { progress: progressMock }
      );
      
      // Should create temporary file and call gradeContract
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '/tmp/inline-spec.yaml',
        yamlContent,
        'utf8'
      );
      
      expect(pipeline.gradeContract).toHaveBeenCalledWith(
        {
          path: '/tmp/inline-spec.yaml',
          templatePath: '/custom/template.yaml'
        },
        { progress: progressMock }
      );
      
      expect(result).toEqual(mockResult);
    });

    test('should handle file write errors', async () => {
      // RED PHASE: Test error handling
      mockFs.writeFile.mockRejectedValue(new Error('Permission denied'));
      
      const progressMock = jest.fn();
      
      await expect(
        pipeline.gradeInline(
          { content: 'test yaml' },
          { progress: progressMock }
        )
      ).rejects.toThrow('Permission denied');
    });
  });
});

describe('Pipeline Database Integration', () => {
  describe('gradeAndRecord()', () => {
    test('should grade API and store results in database', async () => {
      // RED PHASE: Test combined grading and database storage
      const mockGradeResult = MockGradingResultFactory.passingResult();
      
      // Mock gradeContract
      jest.spyOn(pipeline, 'gradeContract').mockResolvedValue(mockGradeResult);
      
      // Mock database operations
      const mockDb = {
        connect: jest.fn(),
        migrate: jest.fn(),
        insertRun: jest.fn()
      };
      
      jest.doMock('../../../src/mcp/persistence/db.js', () => ({
        GraderDB: jest.fn(() => mockDb)
      }));
      
      const progressMock = jest.fn();
      
      const result = await pipeline.gradeAndRecord(
        { path: '/test/valid.yaml' },
        { progress: progressMock }
      );
      
      // Should include run ID and API ID
      expect(result.runId).toMatch(/^run_[a-f0-9]{12}$/);
      expect(result.apiId).toMatch(/^urn:smackdab:api:[a-f0-9]{12}$/);
      
      // Should include original grading result
      expect(result.grade).toEqual(mockGradeResult.grade);
      expect(result.findings).toEqual(mockGradeResult.findings);
      
      // Should call database operations
      expect(mockDb.connect).toHaveBeenCalled();
      expect(mockDb.migrate).toHaveBeenCalled();
      expect(mockDb.insertRun).toHaveBeenCalled();
    });

    test('should handle database connection errors', async () => {
      // RED PHASE: Test database error handling
      const mockDb = {
        connect: jest.fn().mockRejectedValue(new Error('Database unavailable')),
        migrate: jest.fn(),
        insertRun: jest.fn()
      };
      
      jest.doMock('../../../src/mcp/persistence/db.js', () => ({
        GraderDB: jest.fn(() => mockDb)
      }));
      
      const progressMock = jest.fn();
      
      await expect(
        pipeline.gradeAndRecord(
          { path: '/test/valid.yaml' },
          { progress: progressMock }
        )
      ).rejects.toThrow('Database unavailable');
    });
  });

  describe('registerOrIdentifyApi()', () => {
    test('should generate consistent API ID for same content', async () => {
      // RED PHASE: Test API identification
      const content = 'test api content';
      
      const result1 = await pipeline.registerOrIdentifyApi({ content });
      const result2 = await pipeline.registerOrIdentifyApi({ content });
      
      expect(result1.apiId).toBe(result2.apiId);
      expect(result1.apiId).toMatch(/^urn:smackdab:api:[a-f0-9]{12}$/);
    });

    test('should generate different API IDs for different content', async () => {
      // RED PHASE: Test unique identification
      const result1 = await pipeline.registerOrIdentifyApi({ content: 'api 1' });
      const result2 = await pipeline.registerOrIdentifyApi({ content: 'api 2' });
      
      expect(result1.apiId).not.toBe(result2.apiId);
    });

    test('should handle path-based identification', async () => {
      // RED PHASE: Test path-based ID generation
      const result = await pipeline.registerOrIdentifyApi({ path: '/test/api.yaml' });
      
      expect(result.apiId).toMatch(/^urn:smackdab:api:[a-f0-9]{12}$/);
      expect(result.wroteToSpec).toBe(false);
    });
  });
});

describe('Pipeline Utility Functions', () => {
  describe('listCheckpoints()', () => {
    test('should return all available checkpoints', async () => {
      // RED PHASE: Test checkpoint listing
      const checkpoints = await pipeline.listCheckpoints();
      
      expect(Array.isArray(checkpoints)).toBe(true);
      expect(checkpoints.length).toBeGreaterThan(0);
      
      // Each checkpoint should have required fields
      checkpoints.forEach(checkpoint => {
        expect(checkpoint).toHaveProperty('id');
        expect(checkpoint).toHaveProperty('category');
        expect(checkpoint).toHaveProperty('description');
        expect(checkpoint).toHaveProperty('weight');
        expect(checkpoint).toHaveProperty('autoFail');
      });
    });
  });

  describe('explainFinding()', () => {
    test('should return explanation for known rule', async () => {
      // RED PHASE: Test rule explanation
      const explanation = await pipeline.explainFinding({ ruleId: 'TENANCY-REQUIRED' });
      
      expect(explanation.ruleId).toBe('TENANCY-REQUIRED');
      expect(explanation.explanation).toBeDefined();
      expect(explanation.explanation).toContain('weight');
    });

    test('should handle unknown rule ID', async () => {
      // RED PHASE: Test unknown rule handling
      const explanation = await pipeline.explainFinding({ ruleId: 'UNKNOWN-RULE' });
      
      expect(explanation.ruleId).toBe('UNKNOWN-RULE');
      expect(explanation.explanation).toBe('Unknown rule');
    });
  });
});

// These tests will ALL FAIL initially - that's the RED phase of TDD
// They define the expected behavior for the pipeline module
import { describe, test, expect, beforeEach } from '@jest/globals';
import { gradeContract } from '../../../src/app/pipeline';
import { checkPrerequisites } from '../../../src/scoring/prerequisites';
import { scoreWithDependencies } from '../../../src/scoring/dependencies';
import { calculateFinalGrade, compareGrades, wouldLegacyAutoFail } from '../../../src/scoring/finalizer';

describe('Legacy vs Coverage-Based Scoring Comparison', () => {
  // Comprehensive test fixtures for different API quality levels
  const testCases = [
    {
      name: 'Perfect API',
      spec: `
openapi: 3.0.3
info:
  title: Perfect API
  version: 1.0.0
  description: Comprehensive API with all best practices
paths:
  /api/v2/users:
    parameters:
      - $ref: '#/components/parameters/OrganizationHeader'
    get:
      summary: List users with pagination
      tags: [Users]
      description: Retrieve a paginated list of users in the organization
      parameters:
        - $ref: '#/components/parameters/AfterKey'
        - $ref: '#/components/parameters/Limit'
      responses:
        '200':
          description: Users retrieved successfully
          headers:
            ETag:
              schema: { type: string }
            Cache-Control:
              schema: { type: string }
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserListResponse'
              example:
                success: true
                data: [{ id: 1, name: "John Doe" }]
                meta: { total: 100, next_cursor: "abc123" }
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '500':
          $ref: '#/components/responses/InternalError'
      security:
        - OAuth2: [read]
    post:
      summary: Create user
      tags: [Users]
      description: Create a new user in the organization
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateUserRequest'
            example:
              name: "Jane Doe"
              email: "jane@example.com"
      responses:
        '201':
          description: User created successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserResponse'
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '409':
          $ref: '#/components/responses/Conflict'
        '500':
          $ref: '#/components/responses/InternalError'
      security:
        - OAuth2: [write]
  /api/v2/users/{id}:
    parameters:
      - name: id
        in: path
        required: true
        schema: { type: integer, format: int64 }
      - $ref: '#/components/parameters/OrganizationHeader'
    get:
      summary: Get user by ID
      tags: [Users]
      description: Retrieve a specific user by their unique identifier
      responses:
        '200':
          description: User retrieved successfully
          headers:
            ETag:
              schema: { type: string }
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserResponse'
        '404':
          $ref: '#/components/responses/NotFound'
        '500':
          $ref: '#/components/responses/InternalError'
      security:
        - OAuth2: [read]
    put:
      summary: Update user
      tags: [Users]
      description: Update an existing user's information
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UpdateUserRequest'
      responses:
        '200':
          description: User updated successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserResponse'
        '404':
          $ref: '#/components/responses/NotFound'
        '500':
          $ref: '#/components/responses/InternalError'
      security:
        - OAuth2: [write]
    delete:
      summary: Delete user
      tags: [Users]
      description: Permanently delete a user from the system
      responses:
        '204':
          description: User deleted successfully
        '404':
          $ref: '#/components/responses/NotFound'
        '500':
          $ref: '#/components/responses/InternalError'
      security:
        - OAuth2: [write]
components:
  securitySchemes:
    OAuth2:
      type: oauth2
      flows:
        authorizationCode:
          authorizationUrl: https://auth.example.com/oauth/authorize
          tokenUrl: https://auth.example.com/oauth/token
          scopes:
            read: Read access to resources
            write: Write access to resources
  parameters:
    OrganizationHeader:
      name: X-Organization-ID
      in: header
      required: true
      schema: { type: integer, format: int64 }
      description: Organization identifier for multi-tenancy
    AfterKey:
      name: after_key
      in: query
      schema: { type: string }
      description: Cursor for key-set pagination
    Limit:
      name: limit
      in: query
      schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
      description: Maximum number of items to return
  schemas:
    UserListResponse:
      type: object
      required: [success, data, meta]
      properties:
        success: { type: boolean }
        data:
          type: array
          items: { $ref: '#/components/schemas/User' }
        meta: { $ref: '#/components/schemas/PaginationMeta' }
    UserResponse:
      type: object
      required: [success, data]
      properties:
        success: { type: boolean }
        data: { $ref: '#/components/schemas/User' }
    CreateUserRequest:
      type: object
      required: [name, email]
      properties:
        name: { type: string, minLength: 1, maxLength: 100 }
        email: { type: string, format: email }
    UpdateUserRequest:
      type: object
      properties:
        name: { type: string, minLength: 1, maxLength: 100 }
        email: { type: string, format: email }
    User:
      type: object
      required: [id, name, email]
      properties:
        id: { type: integer, format: int64 }
        name: { type: string }
        email: { type: string, format: email }
        created_at: { type: string, format: date-time }
        updated_at: { type: string, format: date-time }
    PaginationMeta:
      type: object
      properties:
        total: { type: integer }
        next_cursor: { type: string }
        prev_cursor: { type: string }
    Error:
      type: object
      required: [success, error]
      properties:
        success: { type: boolean, enum: [false] }
        error:
          type: object
          required: [code, message]
          properties:
            code: { type: string }
            message: { type: string }
            details: { type: object }
  responses:
    BadRequest:
      description: Bad request
      content:
        application/json:
          schema: { $ref: '#/components/schemas/Error' }
    Unauthorized:
      description: Unauthorized
      content:
        application/json:
          schema: { $ref: '#/components/schemas/Error' }
    Forbidden:
      description: Forbidden
      content:
        application/json:
          schema: { $ref: '#/components/schemas/Error' }
    NotFound:
      description: Not found
      content:
        application/json:
          schema: { $ref: '#/components/schemas/Error' }
    Conflict:
      description: Conflict
      content:
        application/json:
          schema: { $ref: '#/components/schemas/Error' }
    InternalError:
      description: Internal server error
      content:
        application/json:
          schema: { $ref: '#/components/schemas/Error' }
security:
  - OAuth2: []
`,
      expectedLegacyGrade: { min: 95, max: 100, letter: 'A+' },
      expectedCoverageGrade: { min: 95, max: 100, letter: 'A+' }
    },
    {
      name: 'Good API with Minor Issues',
      spec: `
openapi: 3.0.3
info:
  title: Good API
  version: 1.0.0
paths:
  /api/v2/users:
    get:
      summary: List users
      parameters:
        - name: X-Organization-ID
          in: header
          required: true
          schema: { type: integer }
        - name: after_key
          in: query
          schema: { type: string }
        - name: limit
          in: query
          schema: { type: integer, default: 20 }
      responses:
        '200':
          description: Users list
          content:
            application/json:
              schema:
                type: object
                properties:
                  success: { type: boolean }
                  data:
                    type: array
                    items: { $ref: '#/components/schemas/User' }
        '400':
          description: Bad request
        '500':
          description: Server error
      security:
        - OAuth2: [read]
    post:
      summary: Create user
      parameters:
        - name: X-Organization-ID
          in: header
          required: true
          schema: { type: integer }
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [name]
              properties:
                name: { type: string }
                email: { type: string }
      responses:
        '201':
          description: Created
          content:
            application/json:
              schema:
                type: object
                properties:
                  success: { type: boolean }
                  data: { $ref: '#/components/schemas/User' }
        '400':
          description: Bad request
      security:
        - OAuth2: [write]
components:
  securitySchemes:
    OAuth2:
      type: oauth2
      flows:
        authorizationCode:
          authorizationUrl: https://auth.example.com/oauth/authorize
          tokenUrl: https://auth.example.com/oauth/token
          scopes:
            read: Read access
            write: Write access
  schemas:
    User:
      type: object
      required: [id, name]
      properties:
        id: { type: integer }
        name: { type: string }
        email: { type: string }
`,
      expectedLegacyGrade: { min: 75, max: 90, letter: /[AB][+-]?/ },
      expectedCoverageGrade: { min: 75, max: 90, letter: /[AB][+-]?/ }
    },
    {
      name: 'Basic API with Missing Features',
      spec: `
openapi: 3.0.3
info:
  title: Basic API
  version: 1.0.0
paths:
  /api/v2/users:
    get:
      summary: Get users
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: array
                items:
                  type: object
                  properties:
                    id: { type: integer }
                    name: { type: string }
    post:
      summary: Create user
      parameters:
        - name: X-Organization-ID
          in: header
          required: true
          schema: { type: integer }
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                name: { type: string }
      responses:
        '201':
          description: Created
components:
  securitySchemes:
    ApiKey:
      type: apiKey
      in: header
      name: X-API-Key
`,
      expectedLegacyGrade: { min: 30, max: 70, letter: /[CD][+-]?/ },
      expectedCoverageGrade: { min: 40, max: 75, letter: /[BCD][+-]?/ }
    },
    {
      name: 'Auto-Fail API (Legacy)',
      spec: `
openapi: 3.0.0
info:
  title: Auto-Fail API
  version: 1.0.0
paths:
  /users:
    get:
      summary: Get users (wrong namespace, wrong version)
      responses:
        '200':
          description: OK
`,
      expectedLegacyGrade: { min: 0, max: 0, letter: 'F' },
      expectedCoverageGrade: { min: 0, max: 0, letter: 'F' }
    }
  ];

  const progressTracker = (stage: string, percentage: number, note?: string) => {
    // Mock progress tracker
  };

  async function compareScoringSystems(spec: string, testName: string) {
    const fs = require('fs');
    
    // Write spec to temp files
    const legacyFile = `/tmp/legacy-${testName.replace(/\s+/g, '-').toLowerCase()}.yaml`;
    const coverageFile = `/tmp/coverage-${testName.replace(/\s+/g, '-').toLowerCase()}.yaml`;
    
    fs.writeFileSync(legacyFile, spec);
    fs.writeFileSync(coverageFile, spec);

    try {
      // Grade with legacy system
      const legacyResult = await gradeContract({
        path: legacyFile,
        legacyMode: true
      }, { progress: progressTracker });

      // Grade with coverage-based system
      const coverageResult = await gradeContract({
        path: coverageFile,
        legacyMode: false
      }, { progress: progressTracker });

      return {
        legacy: legacyResult,
        coverage: coverageResult
      };
    } finally {
      // Cleanup
      if (fs.existsSync(legacyFile)) fs.unlinkSync(legacyFile);
      if (fs.existsSync(coverageFile)) fs.unlinkSync(coverageFile);
    }
  }

  describe('System-to-System Comparison', () => {
    testCases.forEach(({ name, spec, expectedLegacyGrade, expectedCoverageGrade }) => {
      test(`should produce similar results for ${name}`, async () => {
        const results = await compareScoringSystems(spec, name);
        const { legacy, coverage } = results;

        console.log(`\n=== ${name} Results ===`);
        console.log(`Legacy: ${legacy.grade.total}/100 (${legacy.grade.letter})`);
        console.log(`Coverage: ${coverage.grade.total}/100 (${coverage.grade.letter})`);
        console.log(`Delta: ${coverage.grade.total - legacy.grade.total} points`);

        // Check legacy system meets expectations
        expect(legacy.grade.total).toBeGreaterThanOrEqual(expectedLegacyGrade.min);
        expect(legacy.grade.total).toBeLessThanOrEqual(expectedLegacyGrade.max);
        if (typeof expectedLegacyGrade.letter === 'string') {
          expect(legacy.grade.letter).toBe(expectedLegacyGrade.letter);
        } else {
          expect(legacy.grade.letter).toMatch(expectedLegacyGrade.letter);
        }

        // Check coverage system meets expectations
        expect(coverage.grade.total).toBeGreaterThanOrEqual(expectedCoverageGrade.min);
        expect(coverage.grade.total).toBeLessThanOrEqual(expectedCoverageGrade.max);
        if (typeof expectedCoverageGrade.letter === 'string') {
          expect(coverage.grade.letter).toBe(expectedCoverageGrade.letter);
        } else {
          expect(coverage.grade.letter).toMatch(expectedCoverageGrade.letter);
        }

        // Systems should produce reasonably similar results
        const scoreDelta = Math.abs(coverage.grade.total - legacy.grade.total);
        expect(scoreDelta).toBeLessThan(30); // Within 30 points

        // Both should agree on passing status for most cases
        if (name !== 'Auto-Fail API (Legacy)') {
          const passingThreshold = 70;
          const legacyPassing = legacy.grade.total >= passingThreshold;
          const coveragePassing = coverage.grade.total >= passingThreshold;
          
          // Allow some flexibility for borderline cases
          if (Math.abs(legacy.grade.total - passingThreshold) > 10 && 
              Math.abs(coverage.grade.total - passingThreshold) > 10) {
            expect(legacyPassing).toBe(coveragePassing);
          }
        }
      }, 15000);
    });
  });

  describe('Auto-Fail Behavior Comparison', () => {
    const autoFailTests = [
      {
        name: 'Wrong OpenAPI Version',
        spec: `
openapi: 3.0.0
info:
  title: Wrong Version API
  version: 1.0.0
paths:
  /api/v2/test:
    get:
      responses:
        '200':
          description: OK
components:
  securitySchemes:
    ApiKey:
      type: apiKey
      in: header
      name: X-API-Key
`,
        shouldAutoFail: true
      },
      {
        name: 'Missing Security Schemes',
        spec: `
openapi: 3.0.3
info:
  title: No Auth API
  version: 1.0.0
paths:
  /api/v2/users:
    get:
      responses:
        '200':
          description: OK
`,
        shouldAutoFail: true
      },
      {
        name: 'Missing Multi-Tenancy',
        spec: `
openapi: 3.0.3
info:
  title: No Tenancy API
  version: 1.0.0
paths:
  /api/v2/users:
    post:
      summary: Create user without tenancy header
      responses:
        '201':
          description: Created
components:
  securitySchemes:
    OAuth2:
      type: oauth2
      flows:
        implicit:
          authorizationUrl: https://auth.example.com/oauth/authorize
          scopes: {}
`,
        shouldAutoFail: true
      }
    ];

    autoFailTests.forEach(({ name, spec, shouldAutoFail }) => {
      test(`should handle auto-fail consistently for ${name}`, async () => {
        const results = await compareScoringSystems(spec, `autofail-${name}`);
        const { legacy, coverage } = results;

        console.log(`\n=== Auto-Fail Test: ${name} ===`);
        console.log(`Legacy: ${legacy.grade.total}/100, Auto-fail: ${legacy.grade.autoFailTriggered}`);
        console.log(`Coverage: ${coverage.grade.total}/100, Prerequisites: ${coverage.grade.blockedByPrerequisites || 'passed'}`);

        if (shouldAutoFail) {
          // Legacy should trigger auto-fail
          if (legacy.grade.autoFailTriggered !== undefined) {
            expect(legacy.grade.autoFailTriggered).toBe(true);
            expect(legacy.grade.total).toBeLessThanOrEqual(59);
          }

          // Coverage system should block on prerequisites or score very low
          expect(
            coverage.grade.blockedByPrerequisites === true || 
            coverage.grade.total < 30
          ).toBe(true);

          // Both should assign F grade
          expect(legacy.grade.letter).toBe('F');
          expect(coverage.grade.letter).toBe('F');
        }
      }, 10000);
    });
  });

  describe('Scoring Granularity Comparison', () => {
    test('should show coverage system provides more granular scoring', async () => {
      const partialApiSpec = `
openapi: 3.0.3
info:
  title: Partially Complete API
  version: 1.0.0
paths:
  /api/v2/users:
    get:
      summary: List users - partially implemented
      parameters:
        - name: X-Organization-ID
          in: header
          required: true
          schema: { type: integer }
      responses:
        '200':
          description: Users list
          content:
            application/json:
              schema:
                type: object
                properties:
                  success: { type: boolean }
                  data:
                    type: array
                    items: { type: object }
        '500':
          description: Server error
      # Missing: error responses, caching headers, pagination
    post:
      summary: Create user - well implemented
      parameters:
        - name: X-Organization-ID
          in: header
          required: true
          schema: { type: integer }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [name, email]
              properties:
                name: { type: string, minLength: 1 }
                email: { type: string, format: email }
      responses:
        '201':
          description: User created
          content:
            application/json:
              schema:
                type: object
                properties:
                  success: { type: boolean }
                  data: { type: object }
        '400':
          description: Bad request
          content:
            application/json:
              schema: { type: object }
        '401':
          description: Unauthorized
        '409':
          description: Conflict
        '500':
          description: Server error
      security:
        - OAuth2: [write]
components:
  securitySchemes:
    OAuth2:
      type: oauth2
      flows:
        authorizationCode:
          authorizationUrl: https://auth.example.com/oauth/authorize
          tokenUrl: https://auth.example.com/oauth/token
          scopes:
            read: Read access
            write: Write access
`;

      const results = await compareScoringSystems(partialApiSpec, 'partial-api');
      const { legacy, coverage } = results;

      console.log(`\n=== Granularity Comparison ===`);
      console.log(`Legacy: ${legacy.grade.total}/100 (${legacy.findings.length} findings)`);
      console.log(`Coverage: ${coverage.grade.total}/100 (${coverage.findings.length} findings)`);

      // Coverage system should provide more detailed breakdown
      if (coverage.grade.ruleScores) {
        const ruleScores = Object.values(coverage.grade.ruleScores);
        const partialScores = ruleScores.filter((score: any) => 
          score.coverage > 0 && score.coverage < 1
        );
        
        console.log(`Rules with partial coverage: ${partialScores.length}`);
        
        // Coverage system should detect partial implementations better
        expect(partialScores.length).toBeGreaterThan(0);
      }

      // Both systems should identify issues, but coverage should be more precise
      expect(legacy.findings.length).toBeGreaterThan(0);
      expect(coverage.findings.length).toBeGreaterThan(0);
    }, 15000);
  });

  describe('Performance and Consistency', () => {
    test('should maintain consistent performance between systems', async () => {
      const mediumApiSpec = `
openapi: 3.0.3
info:
  title: Medium Complexity API
  version: 1.0.0
paths:
  /api/v2/users:
    get:
      summary: List users
      parameters:
        - name: X-Organization-ID
          in: header
          required: true
          schema: { type: integer }
      responses:
        '200':
          description: OK
      security: [{ OAuth2: [read] }]
    post:
      summary: Create user
      parameters:
        - name: X-Organization-ID
          in: header
          required: true
          schema: { type: integer }
      responses:
        '201':
          description: Created
      security: [{ OAuth2: [write] }]
  /api/v2/orders:
    get:
      summary: List orders
      parameters:
        - name: X-Organization-ID
          in: header
          required: true
          schema: { type: integer }
      responses:
        '200':
          description: OK
      security: [{ OAuth2: [read] }]
    post:
      summary: Create order
      parameters:
        - name: X-Organization-ID
          in: header
          required: true
          schema: { type: integer }
      responses:
        '201':
          description: Created
      security: [{ OAuth2: [write] }]
components:
  securitySchemes:
    OAuth2:
      type: oauth2
      flows:
        implicit:
          authorizationUrl: https://auth.example.com/oauth/authorize
          scopes:
            read: Read access
            write: Write access
`;

      const legacyStart = Date.now();
      const legacyResults = await compareScoringSystems(mediumApiSpec, 'performance-legacy');
      const legacyDuration = Date.now() - legacyStart;

      const coverageStart = Date.now();
      const coverageResults = await compareScoringSystems(mediumApiSpec, 'performance-coverage');
      const coverageDuration = Date.now() - coverageStart;

      console.log(`\n=== Performance Comparison ===`);
      console.log(`Legacy duration: ${legacyDuration}ms`);
      console.log(`Coverage duration: ${coverageDuration}ms`);

      // Both should complete in reasonable time
      expect(legacyDuration).toBeLessThan(10000);
      expect(coverageDuration).toBeLessThan(10000);

      // Results should be deterministic (run twice, get same results)
      const legacyResults2 = await compareScoringSystems(mediumApiSpec, 'consistency-legacy');
      const coverageResults2 = await compareScoringSystems(mediumApiSpec, 'consistency-coverage');

      expect(legacyResults.legacy.grade.total).toBe(legacyResults2.legacy.grade.total);
      expect(coverageResults.coverage.grade.total).toBe(coverageResults2.coverage.grade.total);
    }, 25000);
  });

  describe('Migration Path Analysis', () => {
    test('should identify APIs that would benefit from coverage-based scoring', async () => {
      const edgeCaseApiSpec = `
openapi: 3.0.3
info:
  title: Edge Case API
  version: 1.0.0
  description: API with mixed implementation quality
paths:
  /api/v2/users:
    get:
      summary: Well-implemented list endpoint
      parameters:
        - name: X-Organization-ID
          in: header
          required: true
          schema: { type: integer }
        - name: after_key
          in: query
          schema: { type: string }
        - name: limit
          in: query
          schema: { type: integer, minimum: 1, maximum: 100 }
      responses:
        '200':
          description: Users retrieved
          headers:
            ETag: { schema: { type: string } }
            Cache-Control: { schema: { type: string } }
          content:
            application/json:
              schema:
                type: object
                required: [success, data, meta]
                properties:
                  success: { type: boolean }
                  data:
                    type: array
                    items: { type: object }
                  meta:
                    type: object
                    properties:
                      total: { type: integer }
                      next_cursor: { type: string }
        '400':
          description: Bad request
          content:
            application/json:
              schema: { type: object }
        '401':
          description: Unauthorized
        '403':
          description: Forbidden
        '500':
          description: Server error
      security: [{ OAuth2: [read] }]
    post:
      summary: Poorly-implemented create endpoint
      parameters:
        - name: X-Organization-ID
          in: header
          required: true
          schema: { type: integer }
      requestBody:
        content:
          application/json:
            schema: { type: object }  # No validation!
      responses:
        '201':
          description: Created
          # No response schema, no error handling
      # No security requirements!
  /api/v2/orders:
    get:
      summary: Minimal implementation
      responses:
        '200':
          description: OK
      # Missing everything: tenancy, security, error handling
components:
  securitySchemes:
    OAuth2:
      type: oauth2
      flows:
        authorizationCode:
          authorizationUrl: https://auth.example.com/oauth/authorize
          tokenUrl: https://auth.example.com/oauth/token
          scopes:
            read: Read access
            write: Write access
`;

      const results = await compareScoringSystems(edgeCaseApiSpec, 'edge-case-api');
      const { legacy, coverage } = results;

      console.log(`\n=== Migration Analysis ===`);
      console.log(`Legacy: ${legacy.grade.total}/100 (${legacy.grade.letter})`);
      console.log(`Coverage: ${coverage.grade.total}/100 (${coverage.grade.letter})`);

      // Coverage system should better reflect the mixed quality
      if (coverage.grade.ruleScores) {
        const ruleScores = Object.values(coverage.grade.ruleScores);
        const perfectRules = ruleScores.filter((score: any) => score.coverage === 1);
        const failingRules = ruleScores.filter((score: any) => score.coverage === 0);
        const partialRules = ruleScores.filter((score: any) => 
          score.coverage > 0 && score.coverage < 1
        );

        console.log(`Perfect implementations: ${perfectRules.length}`);
        console.log(`Failing implementations: ${failingRules.length}`);
        console.log(`Partial implementations: ${partialRules.length}`);

        // Should have a mix of all three categories
        expect(perfectRules.length).toBeGreaterThan(0);
        expect(failingRules.length).toBeGreaterThan(0);
      }

      // Coverage system should provide more actionable feedback
      const categoryBreakdown = coverage.grade.perCategory || {};
      const categories = Object.keys(categoryBreakdown);
      expect(categories.length).toBeGreaterThan(3);

      // Each category should show varying levels of completion
      for (const [category, stats] of Object.entries(categoryBreakdown)) {
        const categoryStats = stats as any;
        if (categoryStats.max > 0) {
          const percentage = categoryStats.earned / categoryStats.max;
          expect(percentage).toBeGreaterThanOrEqual(0);
          expect(percentage).toBeLessThanOrEqual(1);
        }
      }
    }, 15000);

    test('should validate legacy auto-fail detection in coverage system', async () => {
      const legacyAutoFailSpec = `
openapi: 3.0.3
info:
  title: Legacy Auto-Fail Patterns
  version: 1.0.0
paths:
  /users:  # Wrong namespace - should auto-fail in legacy
    get:
      parameters:
        - name: offset  # Forbidden pagination - should auto-fail in legacy
          in: query
          schema: { type: integer }
        - name: limit
          in: query
          schema: { type: integer }
      responses:
        '200':
          description: OK
components:
  securitySchemes:
    OAuth2:
      type: oauth2
      flows:
        implicit:
          authorizationUrl: https://auth.example.com/oauth/authorize
          scopes: {}
`;

      const results = await compareScoringSystems(legacyAutoFailSpec, 'legacy-patterns');
      const { legacy, coverage } = results;

      // Test the wouldLegacyAutoFail function
      const legacyAutoFailCheck = wouldLegacyAutoFail(coverage.grade);

      console.log(`\n=== Legacy Auto-Fail Detection ===`);
      console.log(`Legacy auto-fail: ${legacy.grade.autoFailTriggered}`);
      console.log(`Coverage would trigger legacy auto-fail: ${legacyAutoFailCheck}`);

      // Both should identify this as problematic
      expect(legacy.grade.autoFailTriggered).toBe(true);
      expect(legacyAutoFailCheck).toBe(true);
      
      // Both should assign F grade
      expect(legacy.grade.letter).toBe('F');
      expect(coverage.grade.letter).toBe('F');
    }, 10000);
  });

  describe('Detailed Score Breakdown Comparison', () => {
    test('should provide equivalent category-level insights', async () => {
      const categoryTestSpec = `
openapi: 3.0.3
info:
  title: Category Test API
  version: 1.0.0
  description: API for testing category-level scoring
paths:
  /api/v2/users:
    get:
      summary: List users  # Good functionality
      tags: [Users]
      description: Retrieve users with proper documentation
      parameters:
        - name: X-Organization-ID
          in: header
          required: true
          schema: { type: integer }
        - name: after_key
          in: query
          schema: { type: string }
      responses:
        '200':
          description: Success
          headers:
            ETag: { schema: { type: string } }  # Good scalability
          content:
            application/json:
              schema:
                type: object
                properties:
                  success: { type: boolean }
                  data: { type: array, items: { type: object } }
        '400': { description: Bad request }
        '500': { description: Server error }
      security: [{ OAuth2: [read] }]  # Good security
    post:
      summary: Create user
      parameters:
        - name: X-Organization-ID
          in: header
          required: true
          schema: { type: integer }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [name, email]
              properties:
                name: { type: string, minLength: 1 }
                email: { type: string, format: email }
      responses:
        '201': { description: Created }
        '400': { description: Bad request }
      security: [{ OAuth2: [write] }]
components:
  securitySchemes:
    OAuth2:
      type: oauth2
      flows:
        authorizationCode:
          authorizationUrl: https://auth.example.com/oauth/authorize
          tokenUrl: https://auth.example.com/oauth/token
          scopes:
            read: Read access
            write: Write access
`;

      const results = await compareScoringSystems(categoryTestSpec, 'category-test');
      const { legacy, coverage } = results;

      console.log(`\n=== Category Breakdown Comparison ===`);
      
      // Coverage system provides detailed category breakdown
      if (coverage.grade.perCategory) {
        console.log('Coverage system categories:');
        for (const [category, stats] of Object.entries(coverage.grade.perCategory)) {
          const categoryStats = stats as any;
          const percentage = categoryStats.max > 0 
            ? Math.round(categoryStats.earned / categoryStats.max * 100)
            : 0;
          console.log(`  ${category}: ${percentage}% (${categoryStats.earned}/${categoryStats.max})`);
        }
      }

      // Legacy system has findings by category
      console.log(`Legacy findings by category:`);
      const legacyCategories = new Map();
      for (const finding of legacy.findings) {
        const category = finding.category || 'uncategorized';
        legacyCategories.set(category, (legacyCategories.get(category) || 0) + 1);
      }
      for (const [category, count] of legacyCategories) {
        console.log(`  ${category}: ${count} findings`);
      }

      // Both should identify the same general areas of strength/weakness
      const coverageBreakdown = coverage.grade.perCategory || {};
      const strongCategories = Object.entries(coverageBreakdown)
        .filter(([_, stats]) => {
          const categoryStats = stats as any;
          return categoryStats.max > 0 && (categoryStats.earned / categoryStats.max) > 0.8;
        })
        .map(([category, _]) => category);

      const weakCategories = Object.entries(coverageBreakdown)
        .filter(([_, stats]) => {
          const categoryStats = stats as any;
          return categoryStats.max > 0 && (categoryStats.earned / categoryStats.max) < 0.5;
        })
        .map(([category, _]) => category);

      console.log(`Strong categories: ${strongCategories.join(', ')}`);
      console.log(`Weak categories: ${weakCategories.join(', ')}`);

      // Should have both strengths and weaknesses
      expect(strongCategories.length + weakCategories.length).toBeGreaterThan(0);
    }, 15000);
  });

  describe('Score Stability and Variance Analysis', () => {
    test('should demonstrate scoring consistency across similar APIs', async () => {
      const baselineSpec = `
openapi: 3.0.3
info:
  title: Baseline API
  version: 1.0.0
paths:
  /api/v2/users:
    get:
      summary: List users
      parameters:
        - name: X-Organization-ID
          in: header
          required: true
          schema: { type: integer }
      responses:
        '200':
          description: Users list
          content:
            application/json:
              schema: { type: array, items: { type: object } }
        '500':
          description: Server error
      security: [{ OAuth2: [read] }]
components:
  securitySchemes:
    OAuth2:
      type: oauth2
      flows:
        implicit:
          authorizationUrl: https://auth.example.com/oauth/authorize
          scopes: { read: Read access }
`;

      // Very similar spec with minor differences
      const similarSpec = `
openapi: 3.0.3
info:
  title: Similar API
  version: 1.0.1
  description: Nearly identical to baseline
paths:
  /api/v2/users:
    get:
      summary: Get users list
      parameters:
        - name: X-Organization-ID
          in: header
          required: true
          schema: { type: integer }
      responses:
        '200':
          description: List of users
          content:
            application/json:
              schema: { type: array, items: { type: object } }
        '500':
          description: Internal server error
      security: [{ OAuth2: [read] }]
components:
  securitySchemes:
    OAuth2:
      type: oauth2
      flows:
        implicit:
          authorizationUrl: https://auth.example.com/oauth/authorize
          scopes: { read: Read access to resources }
`;

      const baselineResults = await compareScoringSystems(baselineSpec, 'baseline-stability');
      const similarResults = await compareScoringSystems(similarSpec, 'similar-stability');

      console.log(`\n=== Score Stability Analysis ===`);
      console.log(`Baseline - Legacy: ${baselineResults.legacy.grade.total}, Coverage: ${baselineResults.coverage.grade.total}`);
      console.log(`Similar - Legacy: ${similarResults.legacy.grade.total}, Coverage: ${similarResults.coverage.grade.total}`);

      // Scores should be very similar for very similar specs
      const legacyDelta = Math.abs(baselineResults.legacy.grade.total - similarResults.legacy.grade.total);
      const coverageDelta = Math.abs(baselineResults.coverage.grade.total - similarResults.coverage.grade.total);

      expect(legacyDelta).toBeLessThan(5); // Within 5 points
      expect(coverageDelta).toBeLessThan(5); // Within 5 points

      // Letter grades should be the same
      expect(baselineResults.legacy.grade.letter).toBe(similarResults.legacy.grade.letter);
      expect(baselineResults.coverage.grade.letter).toBe(similarResults.coverage.grade.letter);
    }, 20000);

    test('should show appropriate variance for different quality APIs', async () => {
      const lowQualitySpec = `
openapi: 3.0.3
info:
  title: Low Quality API
  version: 1.0.0
paths:
  /api/v2/users:
    get:
      responses:
        '200': { description: OK }
components:
  securitySchemes:
    Basic: { type: http, scheme: basic }
`;

      const highQualitySpec = `
openapi: 3.0.3
info:
  title: High Quality API
  version: 2.0.0
  description: Well-designed API with comprehensive features
paths:
  /api/v2/users:
    parameters:
      - $ref: '#/components/parameters/OrganizationHeader'
    get:
      summary: List users with advanced features
      description: Comprehensive user listing with pagination, filtering, and caching
      parameters:
        - name: after_key
          in: query
          schema: { type: string }
          description: Cursor for pagination
        - name: limit
          in: query
          schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
        - name: filter
          in: query
          schema: { type: string }
          description: Filter criteria
      responses:
        '200':
          description: Users retrieved successfully
          headers:
            ETag: { schema: { type: string } }
            Cache-Control: { schema: { type: string } }
            X-Total-Count: { schema: { type: integer } }
          content:
            application/json:
              schema:
                type: object
                required: [success, data, meta]
                properties:
                  success: { type: boolean }
                  data: { type: array, items: { $ref: '#/components/schemas/User' } }
                  meta: { $ref: '#/components/schemas/PaginationMeta' }
        '400': { $ref: '#/components/responses/BadRequest' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '422': { $ref: '#/components/responses/ValidationError' }
        '500': { $ref: '#/components/responses/InternalError' }
      security: [{ OAuth2: [read] }]
    post:
      summary: Create new user
      description: Create a new user with comprehensive validation
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/CreateUserRequest' }
            examples:
              basic: { $ref: '#/components/examples/BasicUser' }
              premium: { $ref: '#/components/examples/PremiumUser' }
      responses:
        '201':
          description: User created successfully
          headers:
            Location: { schema: { type: string, format: uri } }
          content:
            application/json:
              schema: { $ref: '#/components/schemas/UserResponse' }
        '400': { $ref: '#/components/responses/BadRequest' }
        '409': { $ref: '#/components/responses/Conflict' }
        '422': { $ref: '#/components/responses/ValidationError' }
        '500': { $ref: '#/components/responses/InternalError' }
      security: [{ OAuth2: [write] }]
  /api/v2/users/{id}:
    parameters:
      - name: id
        in: path
        required: true
        schema: { type: integer, format: int64, minimum: 1 }
        description: Unique user identifier
      - $ref: '#/components/parameters/OrganizationHeader'
    get:
      summary: Get user by ID
      responses:
        '200':
          description: User details
          headers:
            ETag: { schema: { type: string } }
          content:
            application/json:
              schema: { $ref: '#/components/schemas/UserResponse' }
        '404': { $ref: '#/components/responses/NotFound' }
        '500': { $ref: '#/components/responses/InternalError' }
      security: [{ OAuth2: [read] }]
components:
  parameters:
    OrganizationHeader:
      name: X-Organization-ID
      in: header
      required: true
      schema: { type: integer, format: int64 }
      description: Organization identifier for multi-tenancy
  securitySchemes:
    OAuth2:
      type: oauth2
      description: OAuth2 authentication with PKCE
      flows:
        authorizationCode:
          authorizationUrl: https://auth.example.com/oauth/authorize
          tokenUrl: https://auth.example.com/oauth/token
          refreshUrl: https://auth.example.com/oauth/refresh
          scopes:
            read: Read access to resources
            write: Write access to resources
            admin: Administrative access
  schemas:
    User:
      type: object
      required: [id, name, email, status]
      properties:
        id: { type: integer, format: int64, readOnly: true }
        name: { type: string, minLength: 1, maxLength: 100 }
        email: { type: string, format: email, maxLength: 254 }
        status: { type: string, enum: [active, inactive, pending] }
        created_at: { type: string, format: date-time, readOnly: true }
        updated_at: { type: string, format: date-time, readOnly: true }
    CreateUserRequest:
      type: object
      required: [name, email]
      properties:
        name: { type: string, minLength: 1, maxLength: 100 }
        email: { type: string, format: email, maxLength: 254 }
        metadata: { type: object, additionalProperties: { type: string } }
    UserResponse:
      type: object
      required: [success, data]
      properties:
        success: { type: boolean }
        data: { $ref: '#/components/schemas/User' }
    PaginationMeta:
      type: object
      properties:
        total: { type: integer, minimum: 0 }
        next_cursor: { type: string, nullable: true }
        prev_cursor: { type: string, nullable: true }
        per_page: { type: integer, minimum: 1, maximum: 100 }
    Error:
      type: object
      required: [success, error]
      properties:
        success: { type: boolean, enum: [false] }
        error:
          type: object
          required: [code, message]
          properties:
            code: { type: string }
            message: { type: string }
            details: { type: object }
            trace_id: { type: string, format: uuid }
  responses:
    BadRequest:
      description: Bad request
      content:
        application/json:
          schema: { $ref: '#/components/schemas/Error' }
    Unauthorized:
      description: Unauthorized
      content:
        application/json:
          schema: { $ref: '#/components/schemas/Error' }
    Forbidden:
      description: Forbidden
      content:
        application/json:
          schema: { $ref: '#/components/schemas/Error' }
    NotFound:
      description: Not found
      content:
        application/json:
          schema: { $ref: '#/components/schemas/Error' }
    Conflict:
      description: Conflict
      content:
        application/json:
          schema: { $ref: '#/components/schemas/Error' }
    ValidationError:
      description: Validation error
      content:
        application/json:
          schema: { $ref: '#/components/schemas/Error' }
    InternalError:
      description: Internal server error
      content:
        application/json:
          schema: { $ref: '#/components/schemas/Error' }
  examples:
    BasicUser:
      summary: Basic user example
      value:
        name: John Doe
        email: john@example.com
    PremiumUser:
      summary: Premium user with metadata
      value:
        name: Jane Smith
        email: jane@example.com
        metadata:
          plan: premium
          tier: gold
security:
  - OAuth2: []
`;

      const lowResults = await compareScoringSystems(lowQualitySpec, 'low-quality-variance');
      const highResults = await compareScoringSystems(highQualitySpec, 'high-quality-variance');

      console.log(`\n=== Quality Variance Analysis ===`);
      console.log(`Low Quality - Legacy: ${lowResults.legacy.grade.total}, Coverage: ${lowResults.coverage.grade.total}`);
      console.log(`High Quality - Legacy: ${highResults.legacy.grade.total}, Coverage: ${highResults.coverage.grade.total}`);

      // High quality should score significantly better
      const legacyGap = highResults.legacy.grade.total - lowResults.legacy.grade.total;
      const coverageGap = highResults.coverage.grade.total - lowResults.coverage.grade.total;

      expect(legacyGap).toBeGreaterThan(40); // Significant difference
      expect(coverageGap).toBeGreaterThan(40); // Significant difference

      // Coverage system might show even more discrimination
      console.log(`Legacy gap: ${legacyGap} points, Coverage gap: ${coverageGap} points`);
      
      // High quality should be A grade, low quality should be D/F
      expect(['A+', 'A', 'A-']).toContain(highResults.legacy.grade.letter);
      expect(['A+', 'A', 'A-']).toContain(highResults.coverage.grade.letter);
      expect(['D+', 'D', 'D-', 'F']).toContain(lowResults.legacy.grade.letter);
      expect(['D+', 'D', 'D-', 'F']).toContain(lowResults.coverage.grade.letter);
    }, 25000);
  });

  describe('Edge Case Handling Comparison', () => {
    test('should handle malformed specifications consistently', async () => {
      const malformedSpec = `
openapi: 3.0.3
info:
  title: Malformed API
  version: 1.0.0
paths:
  /api/v2/users:
    get:
      summary: Malformed endpoint
      parameters:
        - name: X-Organization-ID
          in: header
          schema: { type: integer }
          # Missing required field
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  invalid_ref: { $ref: '#/components/schemas/NonExistent' }
        invalid_response_code:
          description: This is invalid
      # Missing security
    post:
      summary: Another malformed endpoint
      parameters:
        invalid_parameter_format: true
      responses:
        '201': { description: Created }
components:
  schemas:
    ExistingSchema:
      type: object
      properties:
        id: { type: integer }
    # Reference to non-existent schema above will cause issues
  securitySchemes:
    OAuth2:
      type: oauth2
      flows:
        invalid_flow_type:
          authorizationUrl: https://auth.example.com
`;

      const results = await compareScoringSystems(malformedSpec, 'malformed-edge-case');
      const { legacy, coverage } = results;

      console.log(`\n=== Malformed API Handling ===`);
      console.log(`Legacy: ${legacy.grade.total}/100 (${legacy.findings.length} findings)`);
      console.log(`Coverage: ${coverage.grade.total}/100 (${coverage.findings.length} findings)`);

      // Both systems should handle malformed specs gracefully
      expect(legacy.grade.total).toBeGreaterThanOrEqual(0);
      expect(legacy.grade.total).toBeLessThanOrEqual(100);
      expect(coverage.grade.total).toBeGreaterThanOrEqual(0);
      expect(coverage.grade.total).toBeLessThanOrEqual(100);

      // Both should identify structural issues
      expect(legacy.findings.length).toBeGreaterThan(0);
      expect(coverage.findings.length).toBeGreaterThan(0);

      // Both should assign low grades
      expect(legacy.grade.total).toBeLessThan(50);
      expect(coverage.grade.total).toBeLessThan(50);
    }, 15000);

    test('should handle very large specifications efficiently', async () => {
      // Generate a large specification
      let largeSpec = `
openapi: 3.0.3
info:
  title: Large Scale API
  version: 1.0.0
  description: API with many endpoints for performance testing
paths:
`;

      // Add 25 resource endpoints with CRUD operations
      for (let i = 1; i <= 25; i++) {
        largeSpec += `
  /api/v2/resource${i}:
    parameters:
      - name: X-Organization-ID
        in: header
        required: true
        schema: { type: integer }
    get:
      summary: List resource${i}
      parameters:
        - name: limit
          in: query
          schema: { type: integer, default: 20 }
      responses:
        '200':
          description: Resource${i} list
          content:
            application/json:
              schema:
                type: object
                properties:
                  data: { type: array, items: { $ref: '#/components/schemas/Resource${i}' } }
        '400': { description: Bad request }
        '500': { description: Server error }
      security: [{ OAuth2: [read] }]
    post:
      summary: Create resource${i}
      requestBody:
        content:
          application/json:
            schema: { $ref: '#/components/schemas/CreateResource${i}Request' }
      responses:
        '201':
          description: Resource${i} created
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Resource${i}Response' }
        '400': { description: Bad request }
        '409': { description: Conflict }
      security: [{ OAuth2: [write] }]
  /api/v2/resource${i}/{id}:
    parameters:
      - name: id
        in: path
        required: true
        schema: { type: integer }
      - name: X-Organization-ID
        in: header
        required: true
        schema: { type: integer }
    get:
      summary: Get resource${i} by ID
      responses:
        '200':
          description: Resource${i} details
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Resource${i}Response' }
        '404': { description: Not found }
      security: [{ OAuth2: [read] }]
    put:
      summary: Update resource${i}
      requestBody:
        content:
          application/json:
            schema: { $ref: '#/components/schemas/UpdateResource${i}Request' }
      responses:
        '200':
          description: Resource${i} updated
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Resource${i}Response' }
        '404': { description: Not found }
      security: [{ OAuth2: [write] }]
    delete:
      summary: Delete resource${i}
      responses:
        '204': { description: Resource${i} deleted }
        '404': { description: Not found }
      security: [{ OAuth2: [write] }]
`;
      }

      largeSpec += `
components:
  securitySchemes:
    OAuth2:
      type: oauth2
      flows:
        authorizationCode:
          authorizationUrl: https://auth.example.com/oauth/authorize
          tokenUrl: https://auth.example.com/oauth/token
          scopes:
            read: Read access
            write: Write access
  schemas:
`;

      // Add schemas for all resources
      for (let i = 1; i <= 25; i++) {
        largeSpec += `
    Resource${i}:
      type: object
      required: [id, name]
      properties:
        id: { type: integer }
        name: { type: string }
        description: { type: string }
        created_at: { type: string, format: date-time }
    CreateResource${i}Request:
      type: object
      required: [name]
      properties:
        name: { type: string, minLength: 1 }
        description: { type: string }
    UpdateResource${i}Request:
      type: object
      properties:
        name: { type: string, minLength: 1 }
        description: { type: string }
    Resource${i}Response:
      type: object
      required: [success, data]
      properties:
        success: { type: boolean }
        data: { $ref: '#/components/schemas/Resource${i}' }
`;
      }

      largeSpec += `
security:
  - OAuth2: []
`;

      const startTime = Date.now();
      const results = await compareScoringSystems(largeSpec, 'large-scale-performance');
      const endTime = Date.now();
      const totalDuration = endTime - startTime;

      console.log(`\n=== Large Scale Performance ===`);
      console.log(`Total processing time: ${totalDuration}ms`);
      console.log(`Legacy: ${results.legacy.grade.total}/100`);
      console.log(`Coverage: ${results.coverage.grade.total}/100`);
      console.log(`Spec size: ~${Math.round(largeSpec.length / 1024)}KB`);

      // Should complete in reasonable time
      expect(totalDuration).toBeLessThan(30000); // 30 seconds max

      // Should produce valid scores
      expect(results.legacy.grade.total).toBeGreaterThanOrEqual(0);
      expect(results.coverage.grade.total).toBeGreaterThanOrEqual(0);

      // Large, well-structured API should score well
      expect(results.legacy.grade.total).toBeGreaterThan(60);
      expect(results.coverage.grade.total).toBeGreaterThan(60);

      // Should handle scale without errors
      expect(results.legacy.findings).toBeDefined();
      expect(results.coverage.findings).toBeDefined();
    }, 35000);
  });

  describe('Migration Strategy Validation', () => {
    test('should identify optimal migration scenarios', async () => {
      const migrationCandidateSpec = `
openapi: 3.0.3
info:
  title: Migration Candidate API
  version: 1.0.0
  description: API that would benefit from coverage-based scoring
paths:
  /api/v2/users:
    get:
      summary: Excellent list implementation
      parameters:
        - name: X-Organization-ID
          in: header
          required: true
          schema: { type: integer }
        - name: after_key
          in: query
          schema: { type: string }
        - name: limit
          in: query
          schema: { type: integer, minimum: 1, maximum: 100 }
      responses:
        '200':
          description: Users retrieved
          headers:
            ETag: { schema: { type: string } }
            Cache-Control: { schema: { type: string } }
          content:
            application/json:
              schema:
                type: object
                required: [success, data, meta]
                properties:
                  success: { type: boolean }
                  data: { type: array, items: { type: object } }
                  meta: { type: object }
        '400': { description: Bad request }
        '401': { description: Unauthorized }
        '500': { description: Server error }
      security: [{ OAuth2: [read] }]
    post:
      summary: Terrible create implementation
      parameters:
        - name: X-Organization-ID
          in: header
          required: true
          schema: { type: integer }
      requestBody:
        content:
          application/json:
            schema: { type: object } # No validation
      responses:
        '201': { description: Created } # No content schema
        # Missing error responses
      # Missing security!
  /api/v2/orders:
    get:
      summary: Minimal implementation
      responses:
        '200': { description: OK }
      # Missing everything: auth, tenancy, error handling, schemas
    post:
      summary: Another minimal implementation
      responses:
        '201': { description: Created }
      # Missing everything
components:
  securitySchemes:
    OAuth2:
      type: oauth2
      flows:
        authorizationCode:
          authorizationUrl: https://auth.example.com/oauth/authorize
          tokenUrl: https://auth.example.com/oauth/token
          scopes: { read: Read access, write: Write access }
`;

      const results = await compareScoringSystems(migrationCandidateSpec, 'migration-candidate');
      const { legacy, coverage } = results;

      console.log(`\n=== Migration Strategy Analysis ===`);
      console.log(`Legacy: ${legacy.grade.total}/100 (${legacy.findings.length} findings)`);
      console.log(`Coverage: ${coverage.grade.total}/100 (${coverage.findings.length} findings)`);

      // Calculate migration benefit score
      const migrationBenefit = coverage.grade.total - legacy.grade.total;
      console.log(`Migration benefit: ${migrationBenefit > 0 ? '+' : ''}${migrationBenefit} points`);

      // Coverage system should provide more nuanced evaluation
      if (coverage.grade.ruleScores) {
        const ruleScores = Object.values(coverage.grade.ruleScores);
        const perfectRules = ruleScores.filter((score: any) => score.coverage === 1).length;
        const partialRules = ruleScores.filter((score: any) => score.coverage > 0 && score.coverage < 1).length;
        const failingRules = ruleScores.filter((score: any) => score.coverage === 0).length;

        console.log(`Rule implementation quality: ${perfectRules} perfect, ${partialRules} partial, ${failingRules} failing`);

        // Mixed implementation should show variety
        expect(perfectRules).toBeGreaterThan(0);
        expect(failingRules).toBeGreaterThan(0);
      }

      // Coverage system should provide actionable insights
      if (coverage.grade.improvementOpportunities) {
        const opportunities = coverage.grade.improvementOpportunities;
        expect(opportunities.length).toBeGreaterThan(0);
        
        // Should prioritize high-impact fixes
        const highImpactOps = opportunities.filter((op: any) => op.potentialPoints > 10);
        expect(highImpactOps.length).toBeGreaterThan(0);
        
        console.log(`High-impact improvement opportunities: ${highImpactOps.length}`);
      }

      // Both systems should identify the API as problematic
      expect(legacy.grade.total).toBeLessThan(80);
      expect(coverage.grade.total).toBeLessThan(80);
    }, 15000);

    test('should validate backward compatibility of grading', async () => {
      // Test specification that was rated well by legacy system
      const legacyGoodSpec = `
openapi: 3.0.3
info:
  title: Legacy-Friendly API
  version: 1.0.0
paths:
  /api/v2/users:
    get:
      summary: List users
      parameters:
        - name: X-Organization-ID
          in: header
          required: true
          schema: { type: integer }
        - name: after_key
          in: query
          schema: { type: string }
        - name: limit
          in: query
          schema: { type: integer, maximum: 100 }
      responses:
        '200':
          description: Users list
          content:
            application/json:
              schema:
                type: object
                properties:
                  success: { type: boolean }
                  data: { type: array, items: { type: object } }
        '400': { description: Bad request }
        '500': { description: Server error }
      security: [{ OAuth2: [read] }]
    post:
      summary: Create user
      parameters:
        - name: X-Organization-ID
          in: header
          required: true
          schema: { type: integer }
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [name]
              properties:
                name: { type: string }
                email: { type: string }
      responses:
        '201': 
          description: Created
          content:
            application/json:
              schema:
                type: object
                properties:
                  success: { type: boolean }
                  data: { type: object }
        '400': { description: Bad request }
      security: [{ OAuth2: [write] }]
  /api/v2/users/{id}:
    parameters:
      - name: id
        in: path
        required: true
        schema: { type: integer }
      - name: X-Organization-ID
        in: header
        required: true
        schema: { type: integer }
    get:
      responses:
        '200':
          description: User details
          content:
            application/json:
              schema:
                type: object
                properties:
                  success: { type: boolean }
                  data: { type: object }
        '404': { description: Not found }
      security: [{ OAuth2: [read] }]
components:
  securitySchemes:
    OAuth2:
      type: oauth2
      flows:
        authorizationCode:
          authorizationUrl: https://auth.example.com/oauth/authorize
          tokenUrl: https://auth.example.com/oauth/token
          scopes: { read: Read access, write: Write access }
security:
  - OAuth2: []
`;

      const results = await compareScoringSystems(legacyGoodSpec, 'backward-compatibility');
      const { legacy, coverage } = results;

      console.log(`\n=== Backward Compatibility Check ===`);
      console.log(`Legacy: ${legacy.grade.total}/100 (${legacy.grade.letter})`);
      console.log(`Coverage: ${coverage.grade.total}/100 (${coverage.grade.letter})`);

      // Coverage system should not dramatically downgrade good legacy APIs
      const compatibilityGap = Math.abs(coverage.grade.total - legacy.grade.total);
      expect(compatibilityGap).toBeLessThan(25); // Within 25 points

      // If legacy system gives B+ or better, coverage should be similar
      if (['A+', 'A', 'A-', 'B+'].includes(legacy.grade.letter)) {
        expect(['A+', 'A', 'A-', 'B+', 'B'].includes(coverage.grade.letter)).toBe(true);
      }

      // Both should identify the API as generally good
      expect(legacy.grade.total).toBeGreaterThan(65);
      expect(coverage.grade.total).toBeGreaterThan(65);

      console.log(`Compatibility gap: ${compatibilityGap} points - ${compatibilityGap < 15 ? 'EXCELLENT' : compatibilityGap < 25 ? 'GOOD' : 'POOR'}`);
    }, 15000);
  });
});
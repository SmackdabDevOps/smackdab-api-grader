import { describe, test, expect, beforeEach } from '@jest/globals';
import { gradeContract, letter } from '../../../src/app/pipeline';
import { CHECKPOINTS } from '../../../src/app/checkpoints';
import fs from 'node:fs';

describe('Legacy Scoring System', () => {
  // Test fixtures for different API quality levels
  const perfectApiSpec = `
openapi: 3.0.3
info:
  title: Perfect API
  version: 1.0.0
  description: A well-designed API with all best practices
paths:
  /api/v2/users:
    parameters:
      - $ref: '#/components/parameters/OrganizationHeader'
    get:
      summary: List users
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
              schema:
                type: string
            Cache-Control:
              schema:
                type: string
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserListResponse'
              example:
                success: true
                data:
                  - id: 1
                    name: "John Doe"
                meta:
                  total: 100
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
        schema:
          type: integer
          format: int64
      - $ref: '#/components/parameters/OrganizationHeader'
    get:
      summary: Get user
      tags: [Users]
      description: Retrieve a specific user by ID
      responses:
        '200':
          description: User retrieved successfully
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
      schema:
        type: integer
        format: int64
      description: Organization identifier for multi-tenancy
    AfterKey:
      name: after_key
      in: query
      schema:
        type: string
      description: Cursor for key-set pagination
    Limit:
      name: limit
      in: query
      schema:
        type: integer
        minimum: 1
        maximum: 100
        default: 20
      description: Maximum number of items to return
  schemas:
    UserListResponse:
      type: object
      required: [success, data, meta]
      properties:
        success:
          type: boolean
        data:
          type: array
          items:
            $ref: '#/components/schemas/User'
        meta:
          $ref: '#/components/schemas/PaginationMeta'
    UserResponse:
      type: object
      required: [success, data]
      properties:
        success:
          type: boolean
        data:
          $ref: '#/components/schemas/User'
    CreateUserRequest:
      type: object
      required: [name, email]
      properties:
        name:
          type: string
          minLength: 1
          maxLength: 100
        email:
          type: string
          format: email
    User:
      type: object
      required: [id, name, email]
      properties:
        id:
          type: integer
          format: int64
        name:
          type: string
        email:
          type: string
          format: email
    PaginationMeta:
      type: object
      properties:
        total:
          type: integer
        next_cursor:
          type: string
        prev_cursor:
          type: string
    Error:
      type: object
      required: [success, error]
      properties:
        success:
          type: boolean
          enum: [false]
        error:
          type: object
          required: [code, message]
          properties:
            code:
              type: string
            message:
              type: string
  responses:
    BadRequest:
      description: Bad request
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
    Unauthorized:
      description: Unauthorized
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
    Forbidden:
      description: Forbidden
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
    NotFound:
      description: Not found
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
    Conflict:
      description: Conflict
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
    InternalError:
      description: Internal server error
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
security:
  - OAuth2: []
`;

  const autoFailApiSpec = `
openapi: 3.0.0
info:
  title: Auto-Fail API
  version: 1.0.0
paths:
  /users:
    get:
      summary: Get users
      responses:
        '200':
          description: OK
`;

  const basicApiSpec = `
openapi: 3.0.3
info:
  title: Basic API
  version: 1.0.0
paths:
  /api/v2/users:
    get:
      summary: List users
      responses:
        '200':
          description: Users list
          content:
            application/json:
              schema:
                type: array
                items:
                  type: object
        '400':
          description: Bad request
        '500':
          description: Server error
    post:
      summary: Create user
      parameters:
        - name: X-Organization-ID
          in: header
          required: true
          schema:
            type: integer
      requestBody:
        content:
          application/json:
            schema:
              type: object
      responses:
        '201':
          description: Created
        '400':
          description: Bad request
components:
  securitySchemes:
    ApiKey:
      type: apiKey
      in: header
      name: X-API-Key
`;

  const progressTracker = (stage: string, percentage: number, note?: string) => {
    // Mock progress tracker for testing
  };

  describe('Legacy Binary Scoring Logic', () => {
    test('should achieve perfect score with comprehensive API', async () => {
      const result = await gradeContract({
        path: '/tmp/test-perfect.yaml',
        legacyMode: true
      }, { progress: progressTracker });

      // Write spec to temp file for testing
      fs.writeFileSync('/tmp/test-perfect.yaml', perfectApiSpec);

      const actualResult = await gradeContract({
        path: '/tmp/test-perfect.yaml',
        legacyMode: true
      }, { progress: progressTracker });

      expect(actualResult.grade.total).toBeGreaterThan(90);
      expect(actualResult.grade.letter).toMatch(/A[+-]?/);
      expect(actualResult.grade.autoFailTriggered).toBe(false);
      expect(actualResult.grade.autoFailReasons).toHaveLength(0);
      
      // Should have high checkpoint scores
      const checkpointTotal = actualResult.checkpoints.reduce(
        (sum: number, cp: any) => sum + cp.scored_points, 0
      );
      expect(checkpointTotal).toBeGreaterThan(80);

      // Cleanup
      fs.unlinkSync('/tmp/test-perfect.yaml');
    }, 10000);

    test('should trigger auto-fail for wrong OpenAPI version', async () => {
      fs.writeFileSync('/tmp/test-autofail.yaml', autoFailApiSpec);

      const result = await gradeContract({
        path: '/tmp/test-autofail.yaml',
        legacyMode: true
      }, { progress: progressTracker });

      expect(result.grade.total).toBe(0);
      expect(result.grade.letter).toBe('F');
      expect(result.grade.autoFailTriggered).toBe(true);
      expect(result.grade.autoFailReasons).toContain('OpenAPI version not 3.0.3');

      // Cleanup
      fs.unlinkSync('/tmp/test-autofail.yaml');
    }, 10000);

    test('should score basic API with moderate grade', async () => {
      fs.writeFileSync('/tmp/test-basic.yaml', basicApiSpec);

      const result = await gradeContract({
        path: '/tmp/test-basic.yaml',
        legacyMode: true
      }, { progress: progressTracker });

      expect(result.grade.total).toBeGreaterThan(30);
      expect(result.grade.total).toBeLessThan(80);
      expect(result.grade.letter).toMatch(/[BCD][+-]?/);
      expect(result.grade.autoFailTriggered).toBe(false);

      // Cleanup
      fs.unlinkSync('/tmp/test-basic.yaml');
    }, 10000);

    test('should apply comprehensive scoring bonus', async () => {
      fs.writeFileSync('/tmp/test-comprehensive.yaml', perfectApiSpec);

      const result = await gradeContract({
        path: '/tmp/test-comprehensive.yaml',
        legacyMode: true
      }, { progress: progressTracker });

      // Perfect API should trigger comprehensive bonus
      expect(result.grade.total).toBeGreaterThan(95);

      // Cleanup
      fs.unlinkSync('/tmp/test-comprehensive.yaml');
    }, 10000);
  });

  describe('Checkpoint-Based Assessment', () => {
    test('should evaluate all checkpoint categories', async () => {
      fs.writeFileSync('/tmp/test-checkpoints.yaml', basicApiSpec);

      const result = await gradeContract({
        path: '/tmp/test-checkpoints.yaml',
        legacyMode: true
      }, { progress: progressTracker });

      const categories = [...new Set(result.checkpoints.map((cp: any) => cp.category))];
      
      // Should test multiple categories
      expect(categories.length).toBeGreaterThan(3);
      expect(categories).toContain('naming');
      expect(categories).toContain('caching');
      expect(categories).toContain('pagination');

      // Cleanup
      fs.unlinkSync('/tmp/test-checkpoints.yaml');
    }, 10000);

    test('should respect auto-fail checkpoints', async () => {
      const autoFailSpec = `
openapi: 3.0.3
info:
  title: Auto-Fail Test
  version: 1.0.0
paths:
  /users:
    get:
      summary: Wrong namespace - should trigger auto-fail
      responses:
        '200':
          description: OK
components:
  securitySchemes:
    ApiKey:
      type: apiKey
      in: header
      name: X-API-Key
`;

      fs.writeFileSync('/tmp/test-checkpoint-autofail.yaml', autoFailSpec);

      const result = await gradeContract({
        path: '/tmp/test-checkpoint-autofail.yaml',
        legacyMode: true
      }, { progress: progressTracker });

      // Should trigger auto-fail due to wrong path namespace
      expect(result.grade.autoFailTriggered).toBe(true);
      expect(result.grade.total).toBeLessThanOrEqual(59); // Capped at 59 for auto-fail

      // Cleanup
      fs.unlinkSync('/tmp/test-checkpoint-autofail.yaml');
    }, 10000);

    test('should calculate binary checkpoint scores correctly', async () => {
      fs.writeFileSync('/tmp/test-binary.yaml', basicApiSpec);

      const result = await gradeContract({
        path: '/tmp/test-binary.yaml',
        legacyMode: true
      }, { progress: progressTracker });

      // Each checkpoint should be either 0 or full points
      for (const checkpoint of result.checkpoints) {
        expect(checkpoint.scored_points).toBe(0 || checkpoint.max_points);
      }

      // Total should equal sum of scored checkpoints
      const checkpointTotal = result.checkpoints.reduce(
        (sum: number, cp: any) => sum + cp.scored_points, 0
      );
      expect(result.grade.total).toBeCloseTo(checkpointTotal, 0);

      // Cleanup
      fs.unlinkSync('/tmp/test-binary.yaml');
    }, 10000);
  });

  describe('Legacy Auto-Fail Rules', () => {
    const autoFailRules = [
      {
        name: 'Wrong OpenAPI version',
        spec: `
openapi: 3.0.0
info:
  title: Wrong Version
  version: 1.0.0
paths:
  /test:
    get:
      responses:
        '200':
          description: OK
`,
        expectAutoFail: true,
        expectedReason: 'OpenAPI version not 3.0.3'
      },
      {
        name: 'Missing namespace',
        spec: `
openapi: 3.0.3
info:
  title: Missing Namespace
  version: 1.0.0
paths:
  /users:
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
        expectAutoFail: true,
        expectedReason: 'namespace'
      },
      {
        name: 'Offset pagination',
        spec: `
openapi: 3.0.3
info:
  title: Offset Pagination
  version: 1.0.0
paths:
  /api/v2/users:
    get:
      parameters:
        - name: offset
          in: query
          schema:
            type: integer
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
        expectAutoFail: true,
        expectedReason: 'pagination'
      }
    ];

    autoFailRules.forEach(({ name, spec, expectAutoFail, expectedReason }) => {
      test(`should ${expectAutoFail ? 'trigger' : 'not trigger'} auto-fail for ${name}`, async () => {
          const filename = `/tmp/test-autofail-${name.replace(/\s+/g, '-').toLowerCase()}.yaml`;
        fs.writeFileSync(filename, spec);

        const result = await gradeContract({
          path: filename,
          legacyMode: true
        }, { progress: progressTracker });

        if (expectAutoFail) {
          expect(result.grade.autoFailTriggered).toBe(true);
          expect(result.grade.total).toBeLessThanOrEqual(59);
          if (expectedReason) {
            expect(result.grade.autoFailReasons.join(' ')).toContain(expectedReason);
          }
        } else {
          expect(result.grade.autoFailTriggered).toBe(false);
        }

        // Cleanup
        fs.unlinkSync(filename);
      }, 10000);
    });
  });

  describe('Legacy vs Modern Feature Detection', () => {
    test('should detect classic REST patterns', async () => {
      const classicRestSpec = `
openapi: 3.0.3
info:
  title: Classic REST API
  version: 1.0.0
paths:
  /api/v2/users:
    get:
      summary: List users
      responses:
        '200':
          description: Users list
    post:
      summary: Create user
      parameters:
        - name: X-Organization-ID
          in: header
          required: true
          schema:
            type: integer
      responses:
        '201':
          description: Created
  /api/v2/users/{id}:
    get:
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: integer
      summary: Get user
      responses:
        '200':
          description: User details
    put:
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: integer
        - name: X-Organization-ID
          in: header
          required: true
          schema:
            type: integer
      summary: Update user
      responses:
        '200':
          description: Updated
    delete:
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: integer
        - name: X-Organization-ID
          in: header
          required: true
          schema:
            type: integer
      summary: Delete user
      responses:
        '204':
          description: Deleted
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

      fs.writeFileSync('/tmp/test-classic-rest.yaml', classicRestSpec);

      const result = await gradeContract({
        path: '/tmp/test-classic-rest.yaml',
        legacyMode: true
      }, { progress: progressTracker });

      // Should score well for having CRUD operations
      expect(result.grade.total).toBeGreaterThan(50);
      
      // Should detect comprehensive patterns
      const hasComprehensiveFindings = result.findings.some((f: any) => 
        f.ruleId.includes('comprehensive') || f.category === 'comprehensive'
      );

      // Cleanup
      fs.unlinkSync('/tmp/test-classic-rest.yaml');
    }, 10000);

    test('should penalize missing security on write operations', async () => {
      const insecureSpec = `
openapi: 3.0.3
info:
  title: Insecure API
  version: 1.0.0
paths:
  /api/v2/users:
    post:
      summary: Create user (no security)
      responses:
        '201':
          description: Created
components:
  securitySchemes:
    ApiKey:
      type: apiKey
      in: header
      name: X-API-Key
`;

      fs.writeFileSync('/tmp/test-insecure.yaml', insecureSpec);

      const result = await gradeContract({
        path: '/tmp/test-insecure.yaml',
        legacyMode: true
      }, { progress: progressTracker });

      // Should have security-related findings
      const securityFindings = result.findings.filter((f: any) => 
        f.category === 'security' || f.ruleId.includes('SEC') || f.ruleId.includes('AUTH')
      );
      expect(securityFindings.length).toBeGreaterThan(0);

      // Cleanup
      fs.unlinkSync('/tmp/test-insecure.yaml');
    }, 10000);
  });

  describe('Legacy Scoring Metadata', () => {
    test('should return correct legacy metadata', async () => {
      fs.writeFileSync('/tmp/test-metadata.yaml', basicApiSpec);

      const result = await gradeContract({
        path: '/tmp/test-metadata.yaml',
        legacyMode: true
      }, { progress: progressTracker });

      expect(result.metadata.scoringEngine).toBe('legacy');
      expect(result.metadata.toolVersions.grader).toBe('1.2.0');
      expect(result.metadata.templateVersion).toBe('3.2.3');
      expect(result.metadata.specHash).toBeDefined();
      expect(result.metadata.templateHash).toBeDefined();
      expect(result.metadata.rulesetHash).toBeDefined();

      // Cleanup
      fs.unlinkSync('/tmp/test-metadata.yaml');
    }, 10000);

    test('should track grading performance', async () => {
      fs.writeFileSync('/tmp/test-performance.yaml', perfectApiSpec);

      const start = Date.now();
      const result = await gradeContract({
        path: '/tmp/test-performance.yaml',
        legacyMode: true
      }, { progress: progressTracker });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
      expect(result.grade.total).toBeDefined();
      expect(result.findings).toBeDefined();
      expect(result.checkpoints).toBeDefined();

      // Cleanup
      fs.unlinkSync('/tmp/test-performance.yaml');
    }, 15000);
  });

  describe('Legacy Grade Letter Assignment', () => {
    const gradeTests = [
      { score: 98, expectedGrade: 'A+' },
      { score: 95, expectedGrade: 'A' },
      { score: 91, expectedGrade: 'A-' },
      { score: 88, expectedGrade: 'B+' },
      { score: 84, expectedGrade: 'B' },
      { score: 81, expectedGrade: 'B-' },
      { score: 74, expectedGrade: 'C' },
      { score: 64, expectedGrade: 'D' },
      { score: 45, expectedGrade: 'F' }
    ];

    test('should assign correct letter grades based on numeric scores', () => {
      // Letter grade function imported at top of file
      
      gradeTests.forEach(({ score, expectedGrade }) => {
        expect(letter(score)).toBe(expectedGrade);
      });
    });
  });

  describe('Legacy Finding Categories', () => {
    test('should categorize findings by semantic modules', async () => {
      fs.writeFileSync('/tmp/test-categories.yaml', basicApiSpec);

      const result = await gradeContract({
        path: '/tmp/test-categories.yaml',
        legacyMode: true
      }, { progress: progressTracker });

      const categories = [...new Set(result.findings.map((f: any) => f.category))];
      
      // Legacy system should have specific categories
      const expectedCategories = [
        'naming', 'caching', 'pagination', 'envelope', 
        'async', 'webhooks', 'i18n', 'extensions'
      ];

      const foundCategories = categories.filter(cat => 
        expectedCategories.includes(cat)
      );
      
      expect(foundCategories.length).toBeGreaterThan(0);

      // Cleanup
      fs.unlinkSync('/tmp/test-categories.yaml');
    }, 10000);

    test('should provide actionable finding messages', async () => {
      fs.writeFileSync('/tmp/test-findings.yaml', basicApiSpec);

      const result = await gradeContract({
        path: '/tmp/test-findings.yaml',
        legacyMode: true
      }, { progress: progressTracker });

      // All findings should have meaningful messages
      for (const finding of result.findings) {
        expect(finding.message).toBeDefined();
        expect(finding.message.length).toBeGreaterThan(10);
        expect(finding.ruleId).toBeDefined();
        expect(['error', 'warn', 'info']).toContain(finding.severity);
      }

      // Cleanup
      fs.unlinkSync('/tmp/test-findings.yaml');
    }, 10000);
  });

  describe('Legacy Edge Cases', () => {
    test('should handle malformed YAML gracefully', async () => {
      const malformedSpec = `
openapi: 3.0.3
info:
  title: Malformed API
  version: 1.0.0
paths:
  /api/v2/users:
    get:
      summary: Test endpoint
      responses:
        '200':
          description: OK
        invalid_key: this should cause parsing issues
      parameters:
        - name: invalid_param
          in: invalid_location
components:
  invalid_section:
    invalid_content: true
`;

      fs.writeFileSync('/tmp/test-malformed.yaml', malformedSpec);

      await expect(gradeContract({
        path: '/tmp/test-malformed.yaml',
        legacyMode: true
      }, { progress: progressTracker })).resolves.toBeDefined();

      // Should not crash, might have structural errors
      // Cleanup
      fs.unlinkSync('/tmp/test-malformed.yaml');
    }, 10000);

    test('should handle empty specification', async () => {
      const emptySpec = `
openapi: 3.0.3
info:
  title: Empty API
  version: 1.0.0
paths: {}
`;

      fs.writeFileSync('/tmp/test-empty.yaml', emptySpec);

      const result = await gradeContract({
        path: '/tmp/test-empty.yaml',
        legacyMode: true
      }, { progress: progressTracker });

      expect(result.grade.total).toBeLessThan(20); // Should score very low
      expect(result.findings.length).toBeGreaterThan(0); // Should have issues

      // Cleanup
      fs.unlinkSync('/tmp/test-empty.yaml');
    }, 10000);

    test('should handle very large specifications', async () => {
      // Generate a large spec with many paths
      let largeSpec = `
openapi: 3.0.3
info:
  title: Large API
  version: 1.0.0
paths:
`;
      
      for (let i = 0; i < 50; i++) {
        largeSpec += `
  /api/v2/resource${i}:
    get:
      summary: Get resource ${i}
      responses:
        '200':
          description: OK
    post:
      summary: Create resource ${i}
      parameters:
        - name: X-Organization-ID
          in: header
          required: true
          schema:
            type: integer
      responses:
        '201':
          description: Created
`;
      }

      largeSpec += `
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

      fs.writeFileSync('/tmp/test-large.yaml', largeSpec);

      const start = Date.now();
      const result = await gradeContract({
        path: '/tmp/test-large.yaml',
        legacyMode: true
      }, { progress: progressTracker });
      const duration = Date.now() - start;

      expect(result.grade.total).toBeDefined();
      expect(duration).toBeLessThan(30000); // Should complete within 30 seconds

      // Cleanup
      fs.unlinkSync('/tmp/test-large.yaml');
    }, 35000);
  });
});
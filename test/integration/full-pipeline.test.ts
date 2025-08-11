/**
 * Full Pipeline Integration Tests
 * Tests the complete grading flow from start to finish
 */

import * as pipeline from '../../src/app/pipeline';
import { createAndConnectDatabase } from '../../src/mcp/persistence/db-factory';
import fs from 'fs/promises';
import path from 'path';

describe('Full Pipeline Integration', () => {
  let testApiPath: string;
  
  beforeAll(async () => {
    // Create a test API file
    testApiPath = path.join(__dirname, 'test-api.yaml');
    const apiContent = `
openapi: 3.0.3
info:
  title: Integration Test API
  version: 2.0.0
  description: API for integration testing
  x-organization-id: org-123
  x-branch-id: branch-456
servers:
  - url: https://api.example.com
components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
    OAuth2:
      type: oauth2
      flows:
        authorizationCode:
          authorizationUrl: https://auth.example.com/oauth/authorize
          tokenUrl: https://auth.example.com/oauth/token
          scopes:
            read: Read access
            write: Write access
security:
  - BearerAuth: []
  - OAuth2: [read]
paths:
  /api/v2/users:
    get:
      operationId: getUsers
      summary: List users
      description: Retrieve a paginated list of users
      parameters:
        - name: after_key
          in: query
          schema:
            type: string
        - name: limit
          in: query
          schema:
            type: integer
            default: 20
            maximum: 100
      responses:
        '200':
          description: Success
          headers:
            X-Rate-Limit-Limit:
              schema:
                type: integer
            X-Rate-Limit-Remaining:
              schema:
                type: integer
          content:
            application/json:
              schema:
                type: object
                properties:
                  success:
                    type: boolean
                  data:
                    type: array
                    items:
                      type: object
                  meta:
                    type: object
                    properties:
                      pagination:
                        type: object
                  _links:
                    type: object
    post:
      operationId: createUser
      summary: Create user
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [name, email]
              properties:
                name:
                  type: string
                email:
                  type: string
                  format: email
      responses:
        '201':
          description: Created
          headers:
            Location:
              schema:
                type: string
              description: URL of created resource
        '400':
          description: Bad Request
          content:
            application/problem+json:
              schema:
                type: object
`;
    
    await fs.writeFile(testApiPath, apiContent);
  });
  
  afterAll(async () => {
    // Clean up test file
    try {
      await fs.unlink(testApiPath);
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  test('should grade a well-structured API with high score', async () => {
    const result = await pipeline.gradeContract(
      { path: testApiPath },
      { progress: () => {} }
    );
    
    expect(result).toBeDefined();
    expect(result.grade).toBeDefined();
    expect(result.grade.total).toBeGreaterThan(70);
    expect(result.grade.letter).toMatch(/[ABC]/);
    expect(result.findings).toBeDefined();
    expect(Array.isArray(result.findings)).toBe(true);
    expect(result.metadata).toBeDefined();
    expect(result.metadata.specHash).toBeDefined();
  });

  test('should generate version information', async () => {
    const version = await pipeline.version();
    
    expect(version).toBeDefined();
    expect(version.serverVersion).toBeDefined();
    expect(version.instanceId).toBeDefined();
    expect(version.toolVersions).toBeDefined();
  });

  test('should list all checkpoints', async () => {
    const checkpoints = await pipeline.listCheckpoints();
    
    expect(Array.isArray(checkpoints)).toBe(true);
    expect(checkpoints.length).toBeGreaterThan(10);
    checkpoints.forEach(cp => {
      expect(cp).toHaveProperty('id');
      expect(cp).toHaveProperty('description');
      expect(cp).toHaveProperty('category');
      expect(cp).toHaveProperty('weight');
    });
  });

  test('should explain findings', async () => {
    const explanation = await pipeline.explainFinding({ ruleId: 'PATH-001' });
    
    expect(explanation).toBeDefined();
    expect(explanation.ruleId).toBe('PATH-001');
    expect(explanation.explanation).toBeDefined();
  });

  test('should grade and record to database', async () => {
    // Ensure database is initialized
    const db = await createAndConnectDatabase();
    await db.migrate();
    
    const result = await pipeline.gradeAndRecord(
      { path: testApiPath },
      { progress: () => {} }
    );
    
    expect(result).toBeDefined();
    expect(result.runId).toBeDefined();
    expect(result.apiId).toBeDefined();
    expect(result.grade).toBeDefined();
    
    // Verify it was saved
    const history = await db.getHistory(result.apiId, 10);
    expect(history.length).toBeGreaterThan(0);
    expect(history[0].run_id).toBe(result.runId);
  });

  test('should suggest fixes for violations', async () => {
    const fixes = await pipeline.suggestFixes({ path: testApiPath });
    
    expect(fixes).toBeDefined();
    expect(fixes.count).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(fixes.fixes)).toBe(true);
  });

  test('should handle inline grading', async () => {
    const inlineSpec = `
openapi: 3.0.3
info:
  title: Inline Test
  version: 1.0.0
paths:
  /test:
    get:
      responses:
        '200':
          description: OK
`;
    
    const result = await pipeline.gradeInline(
      { content: inlineSpec },
      { progress: () => {} }
    );
    
    expect(result).toBeDefined();
    expect(result.grade).toBeDefined();
    expect(result.findings).toBeDefined();
  });
});
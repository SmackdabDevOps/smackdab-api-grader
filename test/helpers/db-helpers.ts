/**
 * Database Test Helpers - Setup and Teardown Utilities
 * Provides controlled database environment for testing
 */

import { GraderDB } from '../../src/mcp/persistence/db.js';
import { MockDbFactory } from './mock-factories.js';

/**
 * Mock Database for testing - implements same interface as GraderDB
 * but uses in-memory storage instead of persistent database
 */
export class MockGraderDB {
  private connected = false;
  private runs: Array<any> = [];
  private checkpoints: Array<any> = [];
  private findings: Array<any> = [];

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async migrate(): Promise<void> {
    if (!this.connected) {
      throw new Error('Database not connected');
    }
    // Migration is a no-op for mock
  }

  async insertRun(
    runData: any,
    checkpointData: Array<any>,
    findingData: Array<any>
  ): Promise<void> {
    if (!this.connected) {
      throw new Error('Database not connected');
    }

    // Validate input parameters
    if (!runData) {
      throw new Error('runData is required');
    }

    // Validate required fields in runData
    const requiredFields = ['run_id', 'api_id'];
    for (const field of requiredFields) {
      if (!runData[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Store run data
    this.runs.push(runData);

    // Store checkpoint data with run_id
    checkpointData.forEach(checkpoint => {
      this.checkpoints.push({
        ...checkpoint,
        run_id: runData.run_id
      });
    });

    // Store finding data with run_id
    findingData.forEach(finding => {
      this.findings.push({
        ...finding,
        run_id: runData.run_id
      });
    });
  }

  async getHistory(apiId: string, limit: number = 20, since?: string): Promise<Array<any>> {
    if (!this.connected) {
      throw new Error('Database not connected');
    }

    let filtered = this.runs.filter(run => run.api_id === apiId);

    if (since) {
      filtered = filtered.filter(run => run.graded_at >= since);
    }

    // Sort by graded_at descending
    filtered.sort((a, b) => b.graded_at.localeCompare(a.graded_at));

    return filtered.slice(0, limit);
  }

  async getRun(runId: string): Promise<any> {
    if (!this.connected) {
      throw new Error('Database not connected');
    }

    return this.runs.find(run => run.run_id === runId) || null;
  }

  async getCheckpoints(runId: string): Promise<Array<any>> {
    if (!this.connected) {
      throw new Error('Database not connected');
    }

    return this.checkpoints.filter(checkpoint => checkpoint.run_id === runId);
  }

  async getFindings(runId: string): Promise<Array<any>> {
    if (!this.connected) {
      throw new Error('Database not connected');
    }

    return this.findings.filter(finding => finding.run_id === runId);
  }

  // Test helper methods
  clearAll(): void {
    this.runs = [];
    this.checkpoints = [];
    this.findings = [];
  }

  seedData(options: {
    runs?: Array<any>;
    checkpoints?: Array<any>;
    findings?: Array<any>;
  } = {}): void {
    if (options.runs) {
      this.runs = [...options.runs];
    }
    if (options.checkpoints) {
      this.checkpoints = [...options.checkpoints];
    }
    if (options.findings) {
      this.findings = [...options.findings];
    }
  }

  getRuns(): Array<any> {
    return [...this.runs];
  }

  getAllCheckpoints(): Array<any> {
    return [...this.checkpoints];
  }

  getAllFindings(): Array<any> {
    return [...this.findings];
  }
}

/**
 * Database test setup and teardown functions
 */
export class DatabaseTestHelper {
  private mockDb: MockGraderDB;
  private originalGraderDB: any;

  constructor() {
    this.mockDb = new MockGraderDB();
  }

  /**
   * Set up test database before tests
   * Replaces GraderDB with MockGraderDB
   */
  async setup(): Promise<MockGraderDB> {
    // Mock the GraderDB class to return our mock instance
    this.originalGraderDB = (await import('../../src/mcp/persistence/db.js')).GraderDB;
    
    const mockModule = await import('../../src/mcp/persistence/db.js');
    (mockModule as any).GraderDB = jest.fn(() => this.mockDb);

    await this.mockDb.connect();
    await this.mockDb.migrate();

    return this.mockDb;
  }

  /**
   * Clean up test database after tests
   */
  async teardown(): Promise<void> {
    await this.mockDb.disconnect();
    this.mockDb.clearAll();

    // Restore original GraderDB if it was mocked
    if (this.originalGraderDB) {
      const mockModule = await import('../../src/mcp/persistence/db.js');
      (mockModule as any).GraderDB = this.originalGraderDB;
    }
  }

  /**
   * Reset database state between tests
   */
  async reset(): Promise<void> {
    this.mockDb.clearAll();
  }

  /**
   * Seed database with test data
   */
  async seed(options: {
    apiId?: string;
    runCount?: number;
    withCheckpoints?: boolean;
    withFindings?: boolean;
  } = {}): Promise<void> {
    const {
      apiId = 'test-api-id',
      runCount = 3,
      withCheckpoints = true,
      withFindings = true
    } = options;

    const runs = [];
    const checkpoints = [];
    const findings = [];

    for (let i = 0; i < runCount; i++) {
      const runId = `run_${i + 1}`;
      const run = MockDbFactory.historyRow({
        run_id: runId,
        api_id: apiId,
        graded_at: new Date(2024, 0, i + 1).toISOString(),
        total_score: 85 - (i * 5)
      });
      runs.push(run);

      if (withCheckpoints) {
        checkpoints.push(
          {
            run_id: runId,
            checkpoint_id: 'TENANCY-REQUIRED',
            category: 'tenancy',
            max_points: 20,
            scored_points: 20
          },
          {
            run_id: runId,
            checkpoint_id: 'NAMING-OPERATIONS',
            category: 'naming',
            max_points: 15,
            scored_points: 10
          }
        );
      }

      if (withFindings) {
        findings.push(
          {
            run_id: runId,
            rule_id: 'NAMING-CONVENTION',
            severity: 'warn',
            category: 'naming',
            json_path: '$.paths["/users"].get',
            line: 25,
            message: 'operationId should be camelCase'
          },
          {
            run_id: runId,
            rule_id: 'HTTP-STATUS',
            severity: 'info',
            category: 'http',
            json_path: '$.paths["/users"].post.responses',
            line: 35,
            message: 'Consider adding 422 response for validation errors'
          }
        );
      }
    }

    this.mockDb.seedData({ runs, checkpoints, findings });
  }

  /**
   * Get reference to mock database for assertions
   */
  getMockDb(): MockGraderDB {
    return this.mockDb;
  }
}

/**
 * Jest helper functions for database testing
 */

/**
 * Setup database for entire test suite
 */
export async function setupDatabaseTestSuite(): Promise<DatabaseTestHelper> {
  const helper = new DatabaseTestHelper();
  await helper.setup();
  return helper;
}

/**
 * Teardown database for entire test suite
 */
export async function teardownDatabaseTestSuite(helper: DatabaseTestHelper): Promise<void> {
  await helper.teardown();
}

/**
 * Setup database for individual test
 */
export async function setupDatabaseTest(helper: DatabaseTestHelper): Promise<MockGraderDB> {
  await helper.reset();
  return helper.getMockDb();
}

/**
 * Create database test context with beforeAll/afterAll/beforeEach setup
 */
export function createDatabaseTestContext() {
  let helper: DatabaseTestHelper;
  let mockDb: MockGraderDB;

  beforeAll(async () => {
    helper = await setupDatabaseTestSuite();
  });

  afterAll(async () => {
    if (helper) {
      await teardownDatabaseTestSuite(helper);
    }
  });

  beforeEach(async () => {
    if (helper) {
      mockDb = await setupDatabaseTest(helper);
    }
  });

  return {
    getHelper: () => helper,
    getMockDb: () => mockDb
  };
}

/**
 * Database assertion helpers
 */
export const dbAssertions = {
  /**
   * Assert that a run was stored in the database
   */
  expectRunStored: (mockDb: MockGraderDB, runId: string, expectedData?: Partial<any>) => {
    const runs = mockDb.getRuns();
    const run = runs.find(r => r.run_id === runId);
    
    expect(run).toBeDefined();
    if (expectedData) {
      expect(run).toMatchObject(expectedData);
    }
    return run;
  },

  /**
   * Assert that checkpoints were stored for a run
   */
  expectCheckpointsStored: (mockDb: MockGraderDB, runId: string, expectedCount?: number) => {
    const checkpoints = mockDb.getAllCheckpoints().filter(c => c.run_id === runId);
    
    if (expectedCount !== undefined) {
      expect(checkpoints).toHaveLength(expectedCount);
    } else {
      expect(checkpoints.length).toBeGreaterThan(0);
    }
    return checkpoints;
  },

  /**
   * Assert that findings were stored for a run
   */
  expectFindingsStored: (mockDb: MockGraderDB, runId: string, expectedCount?: number) => {
    const findings = mockDb.getAllFindings().filter(f => f.run_id === runId);
    
    if (expectedCount !== undefined) {
      expect(findings).toHaveLength(expectedCount);
    } else {
      expect(findings.length).toBeGreaterThan(0);
    }
    return findings;
  },

  /**
   * Assert that history query returns expected results
   */
  expectHistoryResults: async (mockDb: MockGraderDB, apiId: string, expectedCount?: number) => {
    const history = await mockDb.getHistory(apiId);
    
    if (expectedCount !== undefined) {
      expect(history).toHaveLength(expectedCount);
    } else {
      expect(history.length).toBeGreaterThan(0);
    }
    
    // Assert ordering (most recent first)
    if (history.length > 1) {
      for (let i = 1; i < history.length; i++) {
        expect(history[i - 1].graded_at >= history[i].graded_at).toBe(true);
      }
    }
    
    return history;
  }
};

/**
 * Enhanced Mock Database for migration testing
 * Supports schema changes and data migration scenarios
 */
export class MockDatabase {
  private records: any[] = [];
  private schema: { [table: string]: { [column: string]: string } } = {
    grading_results: {
      id: 'INTEGER PRIMARY KEY',
      api_id: 'VARCHAR(255)',
      score: 'INTEGER',
      grade: 'VARCHAR(10)',
      team_id: 'VARCHAR(255)',
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    }
  };
  public connectionString: string;

  constructor() {
    this.connectionString = 'mock://localhost/test_db';
  }

  async setup(): Promise<void> {
    this.records = [];
  }

  async cleanup(): Promise<void> {
    this.records = [];
  }

  async reset(): Promise<void> {
    this.records = [];
  }

  async insertTestRecords(records: any[]): Promise<void> {
    this.records.push(...records);
  }

  async getAllRecords(): Promise<any[]> {
    return [...this.records];
  }

  async getRecordById(apiId: string): Promise<any> {
    return this.records.find(r => r.api_id === apiId);
  }

  async runMigration(sql: string): Promise<{ success: boolean }> {
    // Mock migration execution
    if (sql.includes('ALTER TABLE')) {
      // Parse ADD COLUMN statements
      const addColumnMatch = sql.match(/ADD COLUMN (\w+) (\w+(?:\(\d+\))?)(?: DEFAULT (.+))?/);
      if (addColumnMatch) {
        const [, columnName, columnType, defaultValue] = addColumnMatch;
        
        // Add column to schema
        this.schema.grading_results[columnName] = columnType;
        
        // Add default values to existing records
        if (defaultValue) {
          this.records.forEach(record => {
            if (!(columnName in record)) {
              record[columnName] = defaultValue.replace(/'/g, '');
            }
          });
        }
      }
    }
    return { success: true };
  }

  getSchema(): { [table: string]: { [column: string]: string } } {
    return JSON.parse(JSON.stringify(this.schema));
  }
}

// Export type for TypeScript support
export type DatabaseTestContext = ReturnType<typeof createDatabaseTestContext>;
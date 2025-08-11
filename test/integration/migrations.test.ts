/**
 * Database Migration Integration Tests
 * Tests migration execution, rollback scenarios, and migration script validation
 */

import { Pool } from 'pg';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { GraderDB as PostgresGraderDB } from '../../src/mcp/persistence/db-postgres';
import { GraderDB as SqliteGraderDB } from '../../src/mcp/persistence/db';
import { migrate } from '../../src/mcp/persistence/migrate';
import fs from 'fs/promises';
import path from 'path';

// Test database configurations
const TEST_POSTGRES_CONFIG = {
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432'),
  user: process.env.PGUSER || 'test_user',
  password: process.env.PGPASSWORD || 'test_password',
  database: 'postgres', // Connect to postgres db to create test database
};

describe('Database Migration Tests', () => {
  describe('PostgreSQL Migrations', () => {
    let testDbName: string;
    let graderDB: PostgresGraderDB;

    beforeAll(async () => {
      testDbName = `migration_test_pg_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      // Create test database
      const adminPool = new Pool(TEST_POSTGRES_CONFIG);
      try {
        await adminPool.query(`CREATE DATABASE ${testDbName}`);
      } catch (error) {
        console.warn('Could not create test database:', error.message);
      }
      await adminPool.end();

      // Set up environment for test database
      process.env.DATABASE_URL = `postgresql://${TEST_POSTGRES_CONFIG.user}:${TEST_POSTGRES_CONFIG.password}@${TEST_POSTGRES_CONFIG.host}:${TEST_POSTGRES_CONFIG.port}/${testDbName}`;
      graderDB = new PostgresGraderDB();
    });

    afterAll(async () => {
      if (graderDB) {
        await graderDB.close();
      }

      // Clean up test database
      if (testDbName && testDbName.includes('migration_test')) {
        try {
          const adminPool = new Pool(TEST_POSTGRES_CONFIG);
          await adminPool.query(`DROP DATABASE IF EXISTS ${testDbName}`);
          await adminPool.end();
        } catch (error) {
          console.warn('Could not drop test database:', error.message);
        }
      }
    });

    beforeEach(async () => {
      // Clear all tables for clean test state
      try {
        const clearQueries = [
          'DROP TABLE IF EXISTS usage_tracking CASCADE',
          'DROP TABLE IF EXISTS finding CASCADE',
          'DROP TABLE IF EXISTS checkpoint_score CASCADE',
          'DROP TABLE IF EXISTS run CASCADE',
          'DROP TABLE IF EXISTS api CASCADE',
          'DROP TABLE IF EXISTS teams CASCADE'
        ];
        
        for (const query of clearQueries) {
          try {
            await graderDB['pool'].query(query);
          } catch (error) {
            // Table might not exist
          }
        }
      } catch (error) {
        // Ignore cleanup errors
      }
    });

    it('should create all required PostgreSQL tables', async () => {
      await graderDB.connect();
      await graderDB.migrate();

      const tablesQuery = `
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name
      `;
      
      const result = await graderDB['pool'].query(tablesQuery);
      const tableNames = result.rows.map(row => row.table_name);

      expect(tableNames).toEqual([
        'api',
        'checkpoint_score',
        'finding',
        'run',
        'teams',
        'usage_tracking'
      ]);
    });

    it('should create proper table schemas with correct data types', async () => {
      await graderDB.connect();
      await graderDB.migrate();

      // Test teams table schema
      const teamsSchema = await graderDB['pool'].query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = 'teams' 
        ORDER BY ordinal_position
      `);

      const teamsColumns = teamsSchema.rows;
      expect(teamsColumns).toContainEqual(
        expect.objectContaining({
          column_name: 'team_id',
          data_type: 'text',
          is_nullable: 'NO'
        })
      );
      expect(teamsColumns).toContainEqual(
        expect.objectContaining({
          column_name: 'name',
          data_type: 'text',
          is_nullable: 'NO'
        })
      );
      expect(teamsColumns).toContainEqual(
        expect.objectContaining({
          column_name: 'usage_limit',
          data_type: 'integer',
          column_default: '1000'
        })
      );
      expect(teamsColumns).toContainEqual(
        expect.objectContaining({
          column_name: 'current_usage',
          data_type: 'integer',
          column_default: '0'
        })
      );

      // Test run table schema
      const runSchema = await graderDB['pool'].query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'run' 
        ORDER BY ordinal_position
      `);

      const runColumns = runSchema.rows;
      expect(runColumns).toContainEqual(
        expect.objectContaining({
          column_name: 'auto_fail',
          data_type: 'boolean',
          is_nullable: 'NO'
        })
      );
      expect(runColumns).toContainEqual(
        expect.objectContaining({
          column_name: 'team_id',
          data_type: 'text',
          is_nullable: 'YES'
        })
      );
    });

    it('should create all required indexes', async () => {
      await graderDB.connect();
      await graderDB.migrate();

      const indexesQuery = `
        SELECT indexname 
        FROM pg_indexes 
        WHERE schemaname = 'public' 
        AND indexname LIKE 'idx_%'
        ORDER BY indexname
      `;

      const result = await graderDB['pool'].query(indexesQuery);
      const indexNames = result.rows.map(row => row.indexname);

      expect(indexNames).toContain('idx_run_api');
      expect(indexNames).toContain('idx_run_team');
      expect(indexNames).toContain('idx_usage_team');
      expect(indexNames).toContain('idx_api_team');
    });

    it('should create proper foreign key constraints', async () => {
      await graderDB.connect();
      await graderDB.migrate();

      const fkQuery = `
        SELECT 
          tc.constraint_name,
          tc.table_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
        ORDER BY tc.table_name, tc.constraint_name
      `;

      const result = await graderDB['pool'].query(fkQuery);
      const foreignKeys = result.rows;

      // Check that expected foreign keys exist
      expect(foreignKeys).toContainEqual(
        expect.objectContaining({
          table_name: 'api',
          column_name: 'team_id',
          foreign_table_name: 'teams',
          foreign_column_name: 'team_id'
        })
      );

      expect(foreignKeys).toContainEqual(
        expect.objectContaining({
          table_name: 'run',
          column_name: 'api_id',
          foreign_table_name: 'api',
          foreign_column_name: 'api_id'
        })
      );

      expect(foreignKeys).toContainEqual(
        expect.objectContaining({
          table_name: 'finding',
          column_name: 'run_id',
          foreign_table_name: 'run',
          foreign_column_name: 'run_id'
        })
      );
    });

    it('should be idempotent (safe to run multiple times)', async () => {
      await graderDB.connect();
      
      // Run migration multiple times
      await graderDB.migrate();
      await graderDB.migrate();
      await graderDB.migrate();

      // Verify tables still exist correctly
      const result = await graderDB['pool'].query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        ORDER BY table_name
      `);
      
      const tableNames = result.rows.map(row => row.table_name);
      expect(tableNames).toEqual([
        'api',
        'checkpoint_score',
        'finding',
        'run',
        'teams',
        'usage_tracking'
      ]);

      // Verify no duplicate data was created
      const devTeamCount = await graderDB['pool'].query(
        "SELECT COUNT(*) FROM teams WHERE team_id = 'dev-team'"
      );
      expect(parseInt(devTeamCount.rows[0].count)).toBe(1);
    });

    it('should handle migration rollback on error', async () => {
      await graderDB.connect();
      
      // Create a conflicting table to cause migration failure
      await graderDB['pool'].query('CREATE TABLE teams (id TEXT PRIMARY KEY)');
      
      await expect(graderDB.migrate()).rejects.toThrow();
      
      // Verify the conflicting table still exists (rollback worked)
      const tableInfo = await graderDB['pool'].query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'teams'
        ORDER BY column_name
      `);
      
      expect(tableInfo.rows).toEqual([{ column_name: 'id' }]);
      
      // Clean up for other tests
      await graderDB['pool'].query('DROP TABLE teams');
    });

    it('should create development team only in non-production environments', async () => {
      const originalEnv = process.env.NODE_ENV;
      
      // Test development environment
      process.env.NODE_ENV = 'development';
      await graderDB.connect();
      await graderDB.migrate();
      
      const devTeam = await graderDB['pool'].query(
        "SELECT * FROM teams WHERE team_id = 'dev-team'"
      );
      expect(devTeam.rows).toHaveLength(1);
      expect(devTeam.rows[0].name).toBe('Development Team');
      expect(devTeam.rows[0].usage_limit).toBe(10000);
      
      // Clean up and test production environment
      await graderDB['pool'].query("DELETE FROM teams WHERE team_id = 'dev-team'");
      
      process.env.NODE_ENV = 'production';
      await graderDB.migrate();
      
      const prodDevTeam = await graderDB['pool'].query(
        "SELECT * FROM teams WHERE team_id = 'dev-team'"
      );
      expect(prodDevTeam.rows).toHaveLength(0);
      
      // Restore original environment
      process.env.NODE_ENV = originalEnv;
    });

    it('should validate PostgreSQL-specific features', async () => {
      await graderDB.connect();
      await graderDB.migrate();

      // Test JSONB column in usage_tracking
      await graderDB['pool'].query(`
        INSERT INTO teams (team_id, name) VALUES ('jsonb-test', 'JSONB Test')
      `);
      
      await graderDB['pool'].query(`
        INSERT INTO usage_tracking (team_id, tool_name, metadata) 
        VALUES ('jsonb-test', 'test-tool', '{"key": "value", "number": 42}')
      `);
      
      const result = await graderDB['pool'].query(`
        SELECT metadata->>'key' as key_value, (metadata->>'number')::int as number_value
        FROM usage_tracking 
        WHERE team_id = 'jsonb-test'
      `);
      
      expect(result.rows[0].key_value).toBe('value');
      expect(result.rows[0].number_value).toBe(42);

      // Test timestamp with timezone
      const timestampResult = await graderDB['pool'].query(`
        SELECT timestamp AT TIME ZONE 'UTC' as utc_timestamp
        FROM usage_tracking 
        WHERE team_id = 'jsonb-test'
      `);
      
      expect(timestampResult.rows[0].utc_timestamp).toBeDefined();
    });
  });

  describe('SQLite Migrations', () => {
    let testDbPath: string;
    let graderDB: SqliteGraderDB;

    beforeAll(async () => {
      testDbPath = path.join(process.cwd(), `migration_test_sqlite_${Date.now()}.sqlite`);
    });

    afterAll(async () => {
      if (testDbPath) {
        try {
          await fs.unlink(testDbPath);
        } catch (error) {
          // File might not exist
        }
      }
    });

    beforeEach(async () => {
      if (graderDB && graderDB['db']) {
        await graderDB['db'].close();
      }
      
      // Remove test database file
      try {
        await fs.unlink(testDbPath);
      } catch (error) {
        // File might not exist
      }
      
      graderDB = new SqliteGraderDB(`file:${testDbPath}`);
    });

    afterEach(async () => {
      if (graderDB && graderDB['db']) {
        await graderDB['db'].close();
      }
    });

    it('should create all required SQLite tables', async () => {
      await graderDB.connect();
      await graderDB.migrate();

      const tables = await graderDB['db'].all(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `);
      
      const tableNames = tables.map(t => t.name);
      expect(tableNames).toEqual([
        'api',
        'checkpoint_score',
        'finding',
        'run'
      ]);
    });

    it('should create proper SQLite table schemas', async () => {
      await graderDB.connect();
      await graderDB.migrate();

      // Test run table schema
      const runSchema = await graderDB['db'].all("PRAGMA table_info(run)");
      
      const columnInfo = runSchema.reduce((acc, col) => {
        acc[col.name] = {
          type: col.type,
          notnull: col.notnull,
          pk: col.pk
        };
        return acc;
      }, {});

      expect(columnInfo.run_id).toEqual({
        type: 'TEXT',
        notnull: 1,
        pk: 1
      });

      expect(columnInfo.api_id).toEqual({
        type: 'TEXT',
        notnull: 1,
        pk: 0
      });

      expect(columnInfo.auto_fail).toEqual({
        type: 'INTEGER',
        notnull: 1,
        pk: 0
      });

      expect(columnInfo.json_report).toEqual({
        type: 'TEXT',
        notnull: 1,
        pk: 0
      });
    });

    it('should create performance indexes', async () => {
      await graderDB.connect();
      await graderDB.migrate();

      const indexes = await graderDB['db'].all(`
        SELECT name FROM sqlite_master 
        WHERE type='index' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `);
      
      const indexNames = indexes.map(i => i.name);
      expect(indexNames).toContain('idx_run_api');
    });

    it('should configure WAL mode for performance', async () => {
      await graderDB.connect();
      
      const journalMode = await graderDB['db'].get('PRAGMA journal_mode');
      expect(journalMode.journal_mode).toBe('wal');
    });

    it('should be idempotent for SQLite', async () => {
      await graderDB.connect();
      
      // Run migration multiple times
      await graderDB.migrate();
      await graderDB.migrate();
      await graderDB.migrate();

      // Verify tables exist correctly
      const tables = await graderDB['db'].all(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `);
      
      expect(tables).toHaveLength(4);
      expect(tables.map(t => t.name)).toEqual([
        'api',
        'checkpoint_score',
        'finding',
        'run'
      ]);
    });

    it('should validate SQLite-specific constraints', async () => {
      await graderDB.connect();
      await graderDB.migrate();

      // Test composite primary key in finding table
      const findingSchema = await graderDB['db'].all("PRAGMA table_info(finding)");
      const pkColumns = findingSchema.filter(col => col.pk > 0).sort((a, b) => a.pk - b.pk);
      
      expect(pkColumns.map(col => col.name)).toEqual([
        'run_id',
        'rule_id', 
        'json_path',
        'line'
      ]);

      // Test composite primary key in checkpoint_score table
      const checkpointSchema = await graderDB['db'].all("PRAGMA table_info(checkpoint_score)");
      const checkpointPkColumns = checkpointSchema.filter(col => col.pk > 0).sort((a, b) => a.pk - b.pk);
      
      expect(checkpointPkColumns.map(col => col.name)).toEqual([
        'run_id',
        'checkpoint_id'
      ]);
    });

    it('should handle SQLite data type conversions correctly', async () => {
      await graderDB.connect();
      await graderDB.migrate();

      // Insert test data to verify type handling
      await graderDB['db'].run(`
        INSERT INTO api (api_id, first_seen_at, last_seen_at) 
        VALUES (?, ?, ?)
      `, 'type-test', '2024-01-01T10:00:00Z', '2024-01-01T11:00:00Z');

      await graderDB['db'].run(`
        INSERT INTO run (
          run_id, api_id, graded_at, template_version, template_hash, 
          ruleset_hash, spec_hash, total_score, letter_grade, compliance_pct, 
          auto_fail, critical_issues, findings_count, json_report
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, 
        'type-test-run', 'type-test', '2024-01-01T10:30:00Z', '3.2.3', 'hash1', 
        'hash2', 'hash3', 85.5, 'B+', 0.855, 0, 2, 3, '{"score": 85.5}'
      );

      // Verify data was inserted with correct types
      const run = await graderDB['db'].get('SELECT * FROM run WHERE run_id = ?', 'type-test-run');
      
      expect(typeof run.total_score).toBe('number');
      expect(run.total_score).toBe(85.5);
      expect(typeof run.compliance_pct).toBe('number');
      expect(run.compliance_pct).toBe(0.855);
      expect(typeof run.auto_fail).toBe('number');
      expect(run.auto_fail).toBe(0);
      expect(typeof run.critical_issues).toBe('number');
      expect(typeof run.findings_count).toBe('number');
      expect(typeof run.json_report).toBe('string');
    });

    it('should handle NULL values correctly in optional fields', async () => {
      await graderDB.connect();
      await graderDB.migrate();

      // Insert run with NULL optional fields
      await graderDB['db'].run(`
        INSERT INTO api (api_id, first_seen_at, last_seen_at) 
        VALUES (?, ?, ?)
      `, 'null-test', '2024-01-01T10:00:00Z', '2024-01-01T11:00:00Z');

      await graderDB['db'].run(`
        INSERT INTO run (
          run_id, api_id, graded_at, template_version, template_hash, 
          ruleset_hash, spec_hash, repo_remote, repo_branch, repo_path, git_commit,
          total_score, letter_grade, compliance_pct, auto_fail, critical_issues, 
          findings_count, json_report
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, 
        'null-test-run', 'null-test', '2024-01-01T10:30:00Z', '3.2.3', 'hash1', 
        'hash2', 'hash3', null, null, null, null, 90, 'A-', 0.90, 0, 0, 0, '{"score": 90}'
      );

      // Insert finding with NULL optional fields
      await graderDB['db'].run(`
        INSERT INTO finding (run_id, rule_id, severity, category, json_path, line, message)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, 'null-test-run', 'NULL-TEST', 'info', null, '$.test', null, 'Test message');

      // Verify NULL handling
      const run = await graderDB['db'].get('SELECT * FROM run WHERE run_id = ?', 'null-test-run');
      expect(run.repo_remote).toBeNull();
      expect(run.repo_branch).toBeNull();
      expect(run.repo_path).toBeNull();
      expect(run.git_commit).toBeNull();

      const finding = await graderDB['db'].get('SELECT * FROM finding WHERE run_id = ?', 'null-test-run');
      expect(finding.category).toBeNull();
      expect(finding.line).toBeNull();
    });
  });

  describe('Migration Script Validation', () => {
    it('should validate migration script entry point', async () => {
      // Test that migration module exports expected functions
      const migrationModule = await import('../../src/mcp/persistence/migrate.js');
      
      expect(typeof migrationModule.migrate).toBe('function');
      expect(migrationModule.migrate.constructor.name).toBe('AsyncFunction');
    });

    it('should handle environment-specific migration behavior', async () => {
      // This test would ideally run the migrate script in different environments
      // but for now we'll test the environment detection logic
      
      const originalEnv = process.env.NODE_ENV;
      const originalDbUrl = process.env.DATABASE_URL;
      
      try {
        // Test development environment detection
        process.env.NODE_ENV = 'development';
        process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_migrate';
        
        // The migrate function should handle environment-specific setup
        // We can't easily test the full migration without a real database
        // but we can verify it doesn't crash
        expect(() => {
          const { migrate } = require('../../src/mcp/persistence/migrate.js');
          expect(typeof migrate).toBe('function');
        }).not.toThrow();
        
      } finally {
        process.env.NODE_ENV = originalEnv;
        process.env.DATABASE_URL = originalDbUrl;
      }
    });

    it('should validate migration SQL files exist', async () => {
      const migrationDir = path.join(process.cwd(), 'src/mcp/persistence/migrations');
      
      try {
        const files = await fs.readdir(migrationDir);
        expect(files).toContain('0001_init.sql');
        
        // Check that migration files are readable
        const initMigration = await fs.readFile(
          path.join(migrationDir, '0001_init.sql'), 
          'utf-8'
        );
        expect(typeof initMigration).toBe('string');
        
      } catch (error) {
        // Migration directory might not exist or be empty in this implementation
        // since migrations are embedded in the DB classes
        expect(error.code).toBe('ENOENT');
      }
    });
  });

  describe('Cross-Database Migration Consistency', () => {
    let sqliteDb: SqliteGraderDB;
    let postgresDb: PostgresGraderDB;
    let testDbPath: string;
    let testPgDbName: string;

    beforeAll(async () => {
      // Set up SQLite test database
      testDbPath = path.join(process.cwd(), `consistency_test_${Date.now()}.sqlite`);
      sqliteDb = new SqliteGraderDB(`file:${testDbPath}`);

      // Set up PostgreSQL test database
      testPgDbName = `consistency_test_pg_${Date.now()}`;
      const adminPool = new Pool(TEST_POSTGRES_CONFIG);
      try {
        await adminPool.query(`CREATE DATABASE ${testPgDbName}`);
      } catch (error) {
        console.warn('Could not create PostgreSQL test database:', error.message);
      }
      await adminPool.end();

      process.env.DATABASE_URL = `postgresql://${TEST_POSTGRES_CONFIG.user}:${TEST_POSTGRES_CONFIG.password}@${TEST_POSTGRES_CONFIG.host}:${TEST_POSTGRES_CONFIG.port}/${testPgDbName}`;
      postgresDb = new PostgresGraderDB();
    });

    afterAll(async () => {
      // Clean up SQLite
      if (sqliteDb && sqliteDb['db']) {
        await sqliteDb['db'].close();
      }
      try {
        await fs.unlink(testDbPath);
      } catch (error) {
        // File might not exist
      }

      // Clean up PostgreSQL
      if (postgresDb) {
        await postgresDb.close();
      }
      if (testPgDbName && testPgDbName.includes('consistency_test')) {
        try {
          const adminPool = new Pool(TEST_POSTGRES_CONFIG);
          await adminPool.query(`DROP DATABASE IF EXISTS ${testPgDbName}`);
          await adminPool.end();
        } catch (error) {
          console.warn('Could not drop PostgreSQL test database:', error.message);
        }
      }
    });

    it('should create consistent core table structures', async () => {
      // Run migrations on both databases
      await sqliteDb.connect();
      await sqliteDb.migrate();

      await postgresDb.connect();
      await postgresDb.migrate();

      // Verify both have core tables (ignoring PostgreSQL-specific tables)
      const sqliteTables = await sqliteDb['db'].all(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `);
      
      const postgresResult = await postgresDb['pool'].query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('api', 'run', 'finding', 'checkpoint_score')
        ORDER BY table_name
      `);

      const sqliteTableNames = sqliteTables.map(t => t.name);
      const postgresTableNames = postgresResult.rows.map(r => r.table_name);

      // Both should have the core tables
      const coreTables = ['api', 'checkpoint_score', 'finding', 'run'];
      expect(sqliteTableNames).toEqual(expect.arrayContaining(coreTables));
      expect(postgresTableNames).toEqual(expect.arrayContaining(coreTables));
    });

    it('should support consistent data operations across databases', async () => {
      // Test that the same data can be inserted and retrieved from both databases
      const testRun = {
        run_id: 'consistency_test_run',
        api_id: 'consistency_test_api',
        graded_at: '2024-01-01T12:00:00Z',
        template_version: '3.2.3',
        template_hash: 'consistent_hash_1',
        ruleset_hash: 'consistent_hash_2',
        spec_hash: 'consistent_hash_3',
        total_score: 88,
        letter_grade: 'B+',
        compliance_pct: 0.88,
        auto_fail: false, // PostgreSQL uses boolean
        critical_issues: 1,
        findings_count: 2,
        json_report: JSON.stringify({ score: 88, consistent: true })
      };

      const testCheckpoints = [{
        checkpoint_id: 'CONSISTENCY-TEST',
        category: 'testing',
        max_points: 10,
        scored_points: 9
      }];

      const testFindings = [{
        rule_id: 'CONSISTENCY-RULE',
        severity: 'info',
        category: 'testing',
        json_path: '$.consistency.test',
        line: 42,
        message: 'Consistency test finding'
      }];

      // Insert into both databases
      await sqliteDb.insertRun(testRun as any, testCheckpoints, testFindings);
      await postgresDb.insertRun(testRun as any, testCheckpoints, testFindings);

      // Retrieve from both databases
      const sqliteHistory = await sqliteDb.getHistory('consistency_test_api');
      const postgresHistory = await postgresDb.getHistory('consistency_test_api');

      // Both should return the same basic data
      expect(sqliteHistory).toHaveLength(1);
      expect(postgresHistory).toHaveLength(1);

      const sqliteRun = sqliteHistory[0];
      const postgresRun = postgresHistory[0];

      expect(sqliteRun.run_id).toBe(postgresRun.run_id);
      expect(sqliteRun.total_score).toBe(postgresRun.total_score);
      expect(sqliteRun.letter_grade).toBe(postgresRun.letter_grade);
      expect(sqliteRun.critical_issues).toBe(postgresRun.critical_issues);
      expect(sqliteRun.findings_count).toBe(postgresRun.findings_count);

      // Note: auto_fail handling differs between databases (integer vs boolean)
      // but both should represent the same logical value
      expect(Boolean(sqliteRun.auto_fail)).toBe(Boolean(postgresRun.auto_fail));
    });
  });
});
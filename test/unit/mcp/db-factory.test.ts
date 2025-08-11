/**
 * Database Factory Tests
 */

import { createDatabase, createAndConnectDatabase, getDatabaseInstance } from '../../../src/mcp/persistence/db-factory';
import { GraderDB as SqliteDB } from '../../../src/mcp/persistence/db';
import { GraderDB as PostgresDB } from '../../../src/mcp/persistence/db-postgres';

jest.mock('../../../src/mcp/persistence/db');
jest.mock('../../../src/mcp/persistence/db-postgres');

describe('Database Factory', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('createDatabase', () => {
    test('should create SQLite database when USE_SQLITE is true', () => {
      process.env.USE_SQLITE = 'true';
      
      const db = createDatabase();
      
      expect(SqliteDB).toHaveBeenCalled();
    });

    test('should create SQLite database when no PostgreSQL config', () => {
      delete process.env.USE_SQLITE;
      delete process.env.DATABASE_URL;
      delete process.env.PGHOST;
      
      const db = createDatabase();
      
      expect(SqliteDB).toHaveBeenCalled();
    });

    test('should create PostgreSQL database when DATABASE_URL is set', () => {
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      delete process.env.USE_SQLITE;
      
      const db = createDatabase();
      
      expect(PostgresDB).toHaveBeenCalled();
    });

    test('should create PostgreSQL database when PGHOST is set', () => {
      process.env.PGHOST = 'localhost';
      delete process.env.USE_SQLITE;
      delete process.env.DATABASE_URL;
      
      const db = createDatabase();
      
      expect(PostgresDB).toHaveBeenCalled();
    });

    test('should use custom SQLite path from environment', () => {
      process.env.USE_SQLITE = 'true';
      process.env.SQLITE_PATH = './custom/path.db';
      
      const db = createDatabase();
      
      expect(SqliteDB).toHaveBeenCalledWith('./custom/path.db');
    });
  });

  describe('createAndConnectDatabase', () => {
    test('should create and connect to database', async () => {
      const mockDb = {
        connect: jest.fn().mockResolvedValue(undefined)
      };
      
      (SqliteDB as jest.Mock).mockImplementation(() => mockDb);
      process.env.USE_SQLITE = 'true';
      
      const db = await createAndConnectDatabase();
      
      expect(mockDb.connect).toHaveBeenCalled();
      expect(db).toBe(mockDb);
    });
  });

  describe('getDatabaseInstance', () => {
    test('should return singleton instance', async () => {
      const mockDb = {
        connect: jest.fn().mockResolvedValue(undefined)
      };
      
      (SqliteDB as jest.Mock).mockImplementation(() => mockDb);
      process.env.USE_SQLITE = 'true';
      
      const db1 = await getDatabaseInstance();
      const db2 = await getDatabaseInstance();
      
      expect(db1).toBe(db2);
      expect(mockDb.connect).toHaveBeenCalledTimes(1);
    });
  });
});
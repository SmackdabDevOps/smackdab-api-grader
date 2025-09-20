/**
 * Database Factory
 * Creates the appropriate database instance based on configuration
 */

import { GraderDB as SqliteDB } from './db.js';
import { GraderDB as PostgresDB } from './db-postgres.js';
import dotenv from 'dotenv';

dotenv.config();

export interface IDatabase {
  connect(): Promise<void>;
  migrate(): Promise<void>;
  close?(): Promise<void>;
  insertRun(run: any, checkpoints: any[], findings: any[]): Promise<void>;
  getHistory(apiId: string, limit: number, since?: string, teamId?: string): Promise<any[]>;
  trackUsage?(teamId: string, tool: string): Promise<void>;
}

/**
 * Creates the appropriate database instance based on environment configuration
 */
export function createDatabase(): IDatabase {
  // Determine which database to use
  const useSqlite = process.env.USE_SQLITE === 'true' || 
                    (!process.env.DATABASE_URL && !process.env.PGHOST);
  
  if (useSqlite) {
    console.log('Using SQLite database');
    const dbPath = process.env.SQLITE_PATH || './data/grader.sqlite';
    return new SqliteDB(dbPath) as any; // Type assertion needed due to interface differences
  } else {
    console.log('Using PostgreSQL database');
    return new PostgresDB() as any;
  }
}

/**
 * Creates and initializes a database connection
 */
export async function createAndConnectDatabase(): Promise<IDatabase> {
  const db = createDatabase();
  await db.connect();
  return db;
}

/**
 * Gets a singleton database instance
 */
let dbInstance: IDatabase | null = null;

export async function getDatabaseInstance(): Promise<IDatabase> {
  if (!dbInstance) {
    dbInstance = await createAndConnectDatabase();
  }
  return dbInstance;
}
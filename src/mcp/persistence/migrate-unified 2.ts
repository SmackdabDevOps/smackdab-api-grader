#!/usr/bin/env tsx
import { GraderDB as SqliteDB } from './db.js';
import { GraderDB as PostgresDB } from './db-postgres.js';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

dotenv.config();

async function ensureDataDirectory() {
  const dataDir = path.join(process.cwd(), 'data');
  try {
    await fs.access(dataDir);
  } catch {
    console.log('Creating data directory...');
    await fs.mkdir(dataDir, { recursive: true });
  }
}

async function migrateWithSqlite() {
  console.log('Using SQLite database for development...');
  
  await ensureDataDirectory();
  
  const dbPath = process.env.SQLITE_PATH || './data/grader.sqlite';
  console.log(`Database path: ${dbPath}`);
  
  const db = new SqliteDB(dbPath);
  
  console.log('Connecting to SQLite database...');
  await db.connect();
  
  console.log('Running SQLite migrations...');
  await db.migrate();
  
  console.log('SQLite migration completed successfully!');
  
  // Don't close SQLite connection - it auto-closes
  return db;
}

async function migrateWithPostgres() {
  console.log('Using PostgreSQL database...');
  
  // Check if we have connection info
  if (!process.env.DATABASE_URL && !process.env.PGHOST) {
    throw new Error('PostgreSQL connection not configured. Set DATABASE_URL or PG* environment variables.');
  }
  
  const db = new PostgresDB();
  
  console.log('Connecting to PostgreSQL database...');
  await db.connect();
  
  console.log('Running PostgreSQL migrations...');
  await db.migrate();
  
  console.log('PostgreSQL migration completed successfully!');
  
  await db.close();
  return db;
}

async function migrate() {
  console.log('Starting database migration...');
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  
  try {
    // Determine which database to use
    const useSqlite = process.env.USE_SQLITE === 'true' || 
                      (!process.env.DATABASE_URL && !process.env.PGHOST);
    
    if (useSqlite) {
      await migrateWithSqlite();
    } else {
      await migrateWithPostgres();
    }
    
    console.log('\n✅ Migration completed successfully!');
    
    // Development mode info
    if (process.env.NODE_ENV !== 'production') {
      console.log('\n📝 Development mode detected.');
      console.log('Default API key created: sk_dev_001');
      console.log('Default team: dev-team');
      console.log('\nTo generate more API keys, run: npm run generate-key');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
      
      // Provide helpful hints
      if (error.message.includes('ECONNREFUSED')) {
        console.error('\n💡 Hint: PostgreSQL server may not be running.');
        console.error('For local development, you can use SQLite by setting USE_SQLITE=true in .env');
      } else if (error.message.includes('password authentication failed')) {
        console.error('\n💡 Hint: Check your PostgreSQL credentials in .env file.');
      } else if (error.message.includes('database') && error.message.includes('does not exist')) {
        console.error('\n💡 Hint: Create the database first or use SQLite for local development.');
      }
    }
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrate();
}

export { migrate };
#!/usr/bin/env tsx
import { GraderDB } from './db-postgres.js';
import dotenv from 'dotenv';

dotenv.config();

async function migrate() {
  console.log('Starting database migration...');
  
  try {
    const db = new GraderDB();
    
    console.log('Connecting to database...');
    await db.connect();
    
    console.log('Running migrations...');
    await db.migrate();
    
    console.log('Migration completed successfully!');
    
    // Create a dev team and API key if in development
    if (process.env.NODE_ENV !== 'production') {
      console.log('\nDevelopment mode detected.');
      console.log('Default team created: dev-team');
      console.log('\nTo generate API keys, run: npm run generate-key');
    }
    
    await db.close();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrate();
}

export { migrate };
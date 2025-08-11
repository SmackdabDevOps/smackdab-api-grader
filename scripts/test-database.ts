#!/usr/bin/env tsx

import { createAndConnectDatabase } from '../src/mcp/persistence/db-factory.js';
import crypto from 'crypto';

async function testDatabase() {
  console.log('Testing database connectivity and operations...\n');
  
  try {
    // Connect to database
    console.log('1. Connecting to database...');
    const db = await createAndConnectDatabase();
    console.log('✅ Connected successfully\n');
    
    // Test inserting a run
    console.log('2. Testing insert operation...');
    const runId = 'test_' + crypto.randomBytes(4).toString('hex');
    const apiId = 'api_' + crypto.randomBytes(4).toString('hex');
    
    const testRun = {
      run_id: runId,
      api_id: apiId,
      graded_at: new Date().toISOString(),
      template_version: '1.0.0',
      template_hash: 'test_hash',
      ruleset_hash: 'test_ruleset',
      spec_hash: 'test_spec',
      total_score: 85,
      letter_grade: 'B',
      compliance_pct: 0.85,
      auto_fail: 0,
      critical_issues: 2,
      findings_count: 5,
      json_report: JSON.stringify({ test: true })
    };
    
    await db.insertRun(testRun, [], []);
    console.log(`✅ Inserted test run: ${runId}\n`);
    
    // Test retrieving history
    console.log('3. Testing history retrieval...');
    const history = await db.getHistory(apiId, 10);
    console.log(`✅ Retrieved ${history.length} records\n`);
    
    if (history.length > 0) {
      console.log('Sample record:');
      console.log(JSON.stringify(history[0], null, 2));
    }
    
    // Close connection if PostgreSQL
    if (db.close) {
      await db.close();
    }
    
    console.log('\n✅ All database tests passed!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Database test failed:', error);
    process.exit(1);
  }
}

testDatabase();
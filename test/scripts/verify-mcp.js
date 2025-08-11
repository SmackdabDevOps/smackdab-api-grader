#!/usr/bin/env node

// Verify MCP is using the new scoring system
import { gradeContract } from './dist/app/pipeline.js';
import fs from 'fs';
import yaml from 'yaml';

console.log('🔍 Verifying MCP Server Configuration...\n');

// Check if the gradeContract function has the right signature
const testSpec = yaml.parse(fs.readFileSync('/Users/brooksswift/Desktop/Smackdab/mock-product-api.yaml', 'utf8'));

const args = {
  path: '/Users/brooksswift/Desktop/Smackdab/mock-product-api.yaml',
  templatePath: './templates/MASTER_API_TEMPLATE_v3.yaml',
  legacyMode: false
};

const progress = (stage, percent, note) => {
  // Silent progress
};

gradeContract(args, { progress })
  .then(result => {
    console.log('✅ MCP Server Verification Results:\n');
    
    // Check for new scoring markers
    if (result.metadata?.instanceId) {
      console.log(`  ✓ Instance ID: ${result.metadata.instanceId}`);
    } else {
      console.log('  ✗ Instance ID: NOT FOUND');
    }
    
    if (result.metadata?.scoringEngine) {
      console.log(`  ✓ Scoring Engine: ${result.metadata.scoringEngine}`);
    } else {
      console.log('  ✗ Scoring Engine: NOT FOUND');
    }
    
    if (result.grade?.coverageBased) {
      console.log('  ✓ Coverage-Based Scoring: ENABLED');
    } else {
      console.log('  ✗ Coverage-Based Scoring: DISABLED');
    }
    
    if (result.grade?.ruleScores) {
      const ruleCount = Object.keys(result.grade.ruleScores).length;
      console.log(`  ✓ Rule Scores: ${ruleCount} rules tracked`);
    } else {
      console.log('  ✗ Rule Scores: NOT TRACKED');
    }
    
    console.log(`\n📊 Score: ${result.grade.total}/100 (${result.grade.letter})`);
    console.log(`   Scoring Mode: ${result.grade.coverageBased ? 'NEW Coverage-Based' : 'OLD Binary'}\n`);
    
    if (!result.grade.coverageBased) {
      console.log('⚠️  WARNING: Still using old binary scoring!');
      console.log('   Try running: npm run build or npx tsc');
    }
  })
  .catch(err => {
    console.error('❌ Verification failed:', err.message);
  });
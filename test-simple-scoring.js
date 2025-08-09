#!/usr/bin/env node

// Test the scoring system with a minimal API that should pass prerequisites

import { checkPrerequisites } from './dist/scoring/prerequisites.js';
import { scoreWithDependencies } from './dist/scoring/dependencies.js';
import { calculateFinalGrade, generateGradeSummary } from './dist/scoring/finalizer.js';

const minimalSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Minimal Test API',
    version: '1.0.0'
  },
  components: {
    securitySchemes: {
      ApiKey: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key'
      }
    }
  },
  security: [
    { ApiKey: [] }
  ],
  paths: {
    '/api/v2/users': {
      get: {
        summary: 'List users',
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: { type: 'object' }
              }
            }
          }
        }
      },
      post: {
        summary: 'Create user',
        parameters: [
          {
            name: 'X-Organization-ID',
            in: 'header',
            required: true,
            schema: { type: 'string' }
          }
        ],
        responses: {
          '201': {
            description: 'Created',
            content: {
              'application/json': {
                schema: { type: 'object' }
              }
            }
          }
        }
      }
    }
  }
};

async function testScoring() {
  console.log('\n=== Testing Coverage-Based Scoring System ===\n');
  
  // Check prerequisites
  console.log('1. Checking prerequisites...');
  const prereqResult = await checkPrerequisites(minimalSpec);
  
  if (!prereqResult.passed) {
    console.log('❌ Prerequisites failed:');
    prereqResult.failures.forEach(f => {
      console.log(`  - ${f.ruleId}: ${f.message}`);
    });
    console.log('\nScoring blocked by prerequisites.');
    return;
  }
  
  console.log('✅ Prerequisites passed!\n');
  
  // Score with dependencies
  console.log('2. Scoring rules with dependency awareness...');
  const ruleScores = scoreWithDependencies(minimalSpec);
  console.log(`   Scored ${ruleScores.size} rules\n`);
  
  // Calculate final grade
  console.log('3. Calculating final grade...');
  const gradeResult = calculateFinalGrade(ruleScores);
  
  // Display results
  console.log('\n=== FINAL RESULTS ===');
  console.log(generateGradeSummary(gradeResult));
  
  // Show category breakdown
  console.log('\nDetailed Category Scores:');
  for (const cat of gradeResult.breakdown) {
    console.log(`  ${cat.category}:`);
    console.log(`    Points: ${cat.earnedPoints.toFixed(1)}/${cat.maxPoints}`);
    console.log(`    Percentage: ${(cat.percentage * 100).toFixed(1)}%`);
    console.log(`    Weighted Score: ${cat.weightedScore.toFixed(1)}`);
  }
  
  // Show some findings
  if (gradeResult.findings.length > 0) {
    console.log('\nTop Issues:');
    gradeResult.findings.slice(0, 5).forEach(f => {
      console.log(`  [${f.severity}] ${f.ruleId}: ${f.message}`);
    });
  }
  
  console.log('\n✅ Test completed!');
}

testScoring().catch(console.error);
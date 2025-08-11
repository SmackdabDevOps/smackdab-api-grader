#!/usr/bin/env node

import { gradeContract } from './dist/app/pipeline.js';
import fs from 'fs/promises';

async function testNewScoring() {
  console.log('\n=== Testing New Coverage-Based Scoring System ===\n');
  
  const progress = (stage, percent, note) => {
    if (note) {
      console.log(`[${percent}%] ${stage}: ${note}`);
    }
  };
  
  try {
    // Test with new scoring system (default)
    console.log('Testing with NEW coverage-based scoring...');
    const newResult = await gradeContract(
      { path: './test-api.yaml', templatePath: './templates/MASTER_API_TEMPLATE_v3.yaml' },
      { progress }
    );
    
    console.log('\n--- NEW SCORING RESULTS ---');
    console.log(`Score: ${newResult.grade.total}/100 (${newResult.grade.letter})`);
    console.log(`Critical Issues: ${newResult.grade.criticalIssues}`);
    console.log(`Coverage-Based: ${newResult.grade.coverageBased || false}`);
    console.log(`Excellence: ${newResult.grade.excellence || false}`);
    console.log(`Blocked by Prerequisites: ${newResult.grade.blockedByPrerequisites || false}`);
    console.log(`Prerequisite Failures: ${newResult.grade.prerequisiteFailures || 0}`);
    
    if (newResult.grade.perCategory) {
      console.log('\nCategory Breakdown:');
      for (const [cat, data] of Object.entries(newResult.grade.perCategory)) {
        console.log(`  ${cat}: ${data.earned?.toFixed(1) || 0}/${data.max || 0} (${data.percentage?.toFixed(1) || 0}%)`);
      }
    }
    
    console.log('\n--- Testing with LEGACY scoring for comparison ---');
    const legacyResult = await gradeContract(
      { path: './test-api.yaml', templatePath: './templates/MASTER_API_TEMPLATE_v3.yaml', legacyMode: true },
      { progress }
    );
    
    console.log('\n--- LEGACY SCORING RESULTS ---');
    console.log(`Score: ${legacyResult.grade.total}/100 (${legacyResult.grade.letter})`);
    console.log(`Auto-Fail: ${legacyResult.grade.autoFailTriggered}`);
    if (legacyResult.grade.autoFailReasons?.length > 0) {
      console.log('Auto-Fail Reasons:');
      legacyResult.grade.autoFailReasons.forEach(r => console.log(`  - ${r}`));
    }
    
    console.log('\n--- COMPARISON ---');
    const improvement = newResult.grade.total - legacyResult.grade.total;
    console.log(`Score Improvement: ${improvement > 0 ? '+' : ''}${improvement} points`);
    console.log(`Grade Change: ${legacyResult.grade.letter} → ${newResult.grade.letter}`);
    
    // Show some findings
    console.log('\nTop Issues Found:');
    const topFindings = newResult.findings
      .filter(f => f.severity === 'error' || f.severity === 'warn')
      .slice(0, 10);
    
    for (const finding of topFindings) {
      console.log(`  [${finding.severity}] ${finding.ruleId}: ${finding.message}`);
    }
    
    // If prerequisites failed, show them
    if (newResult.grade.blockedByPrerequisites) {
      console.log('\nPrerequisite Failures (blocked scoring):');
      const prereqFindings = newResult.findings.filter(f => f.ruleId?.startsWith('PREREQ'));
      for (const finding of prereqFindings) {
        console.log(`  ❌ ${finding.ruleId}: ${finding.message}`);
      }
    }
    
    console.log('\n✅ Test completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testNewScoring().catch(console.error);
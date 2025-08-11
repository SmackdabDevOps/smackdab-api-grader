#!/usr/bin/env node

import fs from 'fs';
import { gradeContract } from './src/app/pipeline.js';

async function gradeAPI(filePath) {
  console.log(`\n📋 Grading API: ${filePath}\n`);
  
  try {
    // Create a simple progress callback
    const progress = (stage, percent, note) => {
      console.log(`[${percent}%] ${stage}: ${note || ''}`);
    };
    
    // Grade the contract
    const result = await gradeContract(
      { path: filePath },
      { progress }
    );
    
    console.log('\n=== GRADING RESULTS ===\n');
    console.log(`Score: ${result.grade.total}/100`);
    console.log(`Grade: ${result.grade.letter}`);
    console.log(`Status: ${result.grade.total >= 70 ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Compliance: ${(result.grade.compliancePct * 100).toFixed(1)}%`);
    
    if (result.grade.perCategory) {
      console.log('\n=== CATEGORY BREAKDOWN ===');
      Object.entries(result.grade.perCategory).forEach(([cat, data]) => {
        console.log(`${cat}: ${data.earned}/${data.max} (${(data.percentage * 100).toFixed(0)}%)`);
      });
    }
    
    if (result.findings && result.findings.length > 0) {
      console.log('\n=== TOP ISSUES ===');
      result.findings.slice(0, 10).forEach((issue, i) => {
        console.log(`${i + 1}. [${issue.severity}] ${issue.message}`);
        if (issue.jsonPath) {
          console.log(`   Path: ${issue.jsonPath}`);
        }
      });
    }
    
    if (result.grade.criticalIssues > 0) {
      console.log(`\n⚠️  Critical Issues: ${result.grade.criticalIssues}`);
    }
    
    if (result.grade.autoFailReasons && result.grade.autoFailReasons.length > 0) {
      console.log('\n❌ AUTO-FAIL REASONS:');
      result.grade.autoFailReasons.forEach(reason => console.log(`  - ${reason}`));
    }
    
    // Save full report
    const reportFile = filePath.replace('.yaml', '-grade-report.json');
    fs.writeFileSync(reportFile, JSON.stringify(result, null, 2));
    console.log(`\n📄 Full report saved to: ${reportFile}`);
    
    return result;
    
  } catch (error) {
    console.error('\n❌ Grading failed:', error.message);
    console.error('\nStack trace:', error.stack);
  }
}

// Run the grader
const apiFile = process.argv[2] || '/Users/brooksswift/Desktop/api-grader-mcp-starter/test-api.yaml';
gradeAPI(apiFile).catch(console.error);
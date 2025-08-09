#!/usr/bin/env tsx

import * as pipeline from './src/app/pipeline.js';

async function testGrader() {
  console.log('Testing grader with Mock Product API...\n');
  
  const result = await pipeline.gradeContract({
    path: '/Users/brooksswift/Desktop/Smackdab/mock-product-api-fixed.yaml',
    templatePath: '/Users/brooksswift/Desktop/Smackdab/.claude/templates/MASTER_API_TEMPLATE_v3.yaml'
  }, {
    progress: (stage: string, pct: number, note?: string) => {
      console.log(`[${pct}%] ${stage}: ${note || ''}`);
    }
  });
  
  console.log('\n=== GRADING RESULTS ===');
  console.log(`Score: ${result.grade.total}/100`);
  console.log(`Grade: ${result.grade.letter}`);
  console.log(`Compliance: ${(result.grade.compliancePct * 100).toFixed(1)}%`);
  
  if (result.grade.autoFailTriggered) {
    console.log('\nAUTO-FAIL TRIGGERED:');
    result.grade.autoFailReasons.forEach((reason: string) => {
      console.log(`  - ${reason}`);
    });
  }
  
  console.log('\nCritical Issues: ' + result.grade.criticalIssues);
  
  console.log('\nFindings by severity:');
  const errorCount = result.findings.filter((f: any) => f.severity === 'error').length;
  const warnCount = result.findings.filter((f: any) => f.severity === 'warn').length;
  const infoCount = result.findings.filter((f: any) => f.severity === 'info').length;
  
  console.log(`  Errors: ${errorCount}`);
  console.log(`  Warnings: ${warnCount}`);
  console.log(`  Info: ${infoCount}`);
  
  if (errorCount > 0) {
    console.log('\nError details:');
    result.findings
      .filter((f: any) => f.severity === 'error')
      .slice(0, 10)  // Show first 10 errors
      .forEach((f: any) => {
        console.log(`  [${f.ruleId}] ${f.message}`);
      });
    if (errorCount > 10) {
      console.log(`  ... and ${errorCount - 10} more errors`);
    }
  }
  
  if (warnCount > 0) {
    console.log('\nWarning details:');
    result.findings
      .filter((f: any) => f.severity === 'warn')
      .slice(0, 5)  // Show first 5 warnings
      .forEach((f: any) => {
        console.log(`  [${f.ruleId}] ${f.message}`);
      });
    if (warnCount > 5) {
      console.log(`  ... and ${warnCount - 5} more warnings`);
    }
  }
  
  console.log('\nCategory scores:');
  Object.entries(result.grade.perCategory || {}).forEach(([cat, score]) => {
    console.log(`  ${cat}: ${score}`);
  });
}

testGrader().catch(console.error);
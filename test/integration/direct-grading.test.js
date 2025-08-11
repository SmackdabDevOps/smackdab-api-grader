#!/usr/bin/env node

import { gradeContract } from './dist/app/pipeline.js';

const args = {
  path: process.argv[2] || '/tmp/test-api-minimal.yaml',
  templatePath: './templates/MASTER_API_TEMPLATE_v3.yaml',
  legacyMode: process.argv[3] === '--legacy'
};

const progress = (stage, percent, note) => {
  console.log(`[${percent}%] ${stage}: ${note || ''}`);
};

console.log(`\n=== Grading ${args.path} ===`);
console.log(`Mode: ${args.legacyMode ? 'LEGACY' : 'NEW COVERAGE-BASED'}\n`);

gradeContract(args, { progress })
  .then(result => {
    console.log('\n=== GRADER VERSION INFO ===');
    console.log(`Instance ID: ${result.metadata.instanceId || 'unknown'}`);
    console.log(`Instance Started: ${result.metadata.instanceStartTime || 'unknown'}`);
    console.log(`Graded At: ${result.metadata.gradedAt || 'unknown'}`);
    console.log(`Scoring Engine: ${result.metadata.scoringEngine || 'unknown'}`);
    console.log(`Grader Version: ${result.metadata.toolVersions?.grader || 'unknown'}`);
    
    console.log('\n=== RESULTS ===');
    console.log(`Score: ${result.grade.total}/100 (${result.grade.letter})`);
    console.log(`Compliance: ${(result.grade.compliancePct * 100).toFixed(1)}%`);
    
    if (result.grade.blockedByPrerequisites) {
      console.log('\n❌ BLOCKED BY PREREQUISITES');
      console.log(`Prerequisites Failed: ${result.grade.prerequisiteFailures}`);
    } else if (result.grade.coverageBased) {
      console.log('\n✅ NEW COVERAGE-BASED SCORING');
      console.log('Category Breakdown:');
      for (const [cat, data] of Object.entries(result.grade.perCategory || {})) {
        console.log(`  ${cat}: ${data.percentage?.toFixed(1) || 0}%`);
      }
    } else if (result.grade.autoFailTriggered) {
      console.log('\n❌ LEGACY AUTO-FAIL');
      result.grade.autoFailReasons?.forEach(r => console.log(`  - ${r}`));
    }
    
    // Show rule-by-rule scoring
    if (result.grade.ruleScores) {
      console.log('\nRule-by-Rule Scoring:');
      for (const [ruleId, score] of Object.entries(result.grade.ruleScores)) {
        const coverage = score.coverage || 0;
        const points = score.score || 0;
        const max = score.maxPoints || 0;
        const status = coverage === 1 ? '✅' : coverage > 0 ? '⚠️' : '❌';
        console.log(`  ${status} ${ruleId}: ${points.toFixed(1)}/${max} (${(coverage * 100).toFixed(0)}% coverage)`);
      }
    }
    
    console.log('\nTop Issues:');
    result.findings
      .filter(f => f.severity === 'error' || f.severity === 'warn')
      .slice(0, 10)
      .forEach(f => console.log(`  [${f.severity}] ${f.ruleId}: ${f.message}`));
    
    // Show prerequisite failures specifically
    if (result.grade.blockedByPrerequisites) {
      console.log('\nPrerequisite Failures (must fix to enable scoring):');
      result.findings
        .filter(f => f.ruleId?.startsWith('PREREQ'))
        .forEach(f => console.log(`  ❌ ${f.ruleId}: ${f.message}`));
    }
  })
  .catch(console.error);
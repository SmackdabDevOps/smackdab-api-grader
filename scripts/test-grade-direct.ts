#!/usr/bin/env tsx

import * as pipeline from '../src/app/pipeline.js';

async function testGrading() {
  console.log('Testing grading pipeline directly...\n');
  
  try {
    // Test with a simple inline spec
    const result = await pipeline.gradeInline({
      content: `openapi: 3.0.3
info:
  title: Test API
  version: 1.0.0
paths:
  /api/v2/test:
    get:
      summary: Test endpoint
      responses:
        '200':
          description: Success`,
      templatePath: './templates/MASTER_API_TEMPLATE_v3.yaml'
    }, {
      progress: (stage, pct, note) => {
        console.log(`Progress: ${stage} - ${pct}% ${note || ''}`);
      }
    });
    
    console.log('\nGrade result:');
    console.log(`Score: ${result.grade.total}`);
    console.log(`Letter: ${result.grade.letter}`);
    console.log(`Findings: ${result.findings.length}`);
    
    if (result.findings.length > 0) {
      console.log('\nSample findings:');
      result.findings.slice(0, 3).forEach(f => {
        console.log(`- [${f.severity}] ${f.ruleId}: ${f.message}`);
      });
    }
    
    console.log('\n✅ Grading pipeline is working!');
  } catch (error) {
    console.error('❌ Grading failed:', error);
    if (error instanceof Error) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

testGrading();
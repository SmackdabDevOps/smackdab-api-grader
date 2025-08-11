import { gradeContract } from './dist/app/pipeline.js';
import fs from 'fs';

async function testDirectGrading() {
  try {
    const apiContent = fs.readFileSync('/Users/brooksswift/Desktop/api-grader-mcp-starter/test-api.yaml', 'utf8');
    
    console.log('Starting grading...');
    const result = await gradeContract(apiContent);
    
    console.log('\n=== GRADING RESULTS ===');
    console.log('Score:', result.score);
    console.log('Letter Grade:', result.letterGrade);
    console.log('Pass/Fail:', result.passed ? 'PASS' : 'FAIL');
    console.log('\nSummary:', result.summary);
    
    if (result.issues && result.issues.length > 0) {
      console.log('\n=== TOP ISSUES ===');
      result.issues.slice(0, 5).forEach((issue, i) => {
        console.log(`${i + 1}. [${issue.severity}] ${issue.message}`);
      });
    }
    
  } catch (error) {
    console.error('Grading failed:', error.message);
  }
}

testDirectGrading();
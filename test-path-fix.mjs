import { gradeContract } from './dist/app/pipeline.js';

async function testPathFix() {
  console.log('Testing Path Validation Fix\n');
  console.log('='.repeat(50));
  
  try {
    // Test the correctly structured API
    console.log('\nGrading API with correct relative paths...');
    const result = await gradeContract(
      { 
        path: './test-api-correct-paths.yaml',
        templatePath: './templates/MASTER_API_TEMPLATE_v3.yaml'
      },
      { progress: () => {} }
    );
    
    console.log(`Score: ${result.grade.total}`);
    console.log(`Grade: ${result.grade.letter}`);
    console.log(`Total Findings: ${result.findings.length}`);
    
    // Check for path-related findings
    const pathFindings = result.findings.filter(f => 
      f.message?.includes('Path must start') || 
      f.message?.includes('/api/v2') ||
      f.message?.includes('namespace')
    );
    
    if (pathFindings.length === 0) {
      console.log('\n✅ SUCCESS: No incorrect path validation errors!');
      console.log('The grader now correctly accepts paths relative to server URL.');
    } else {
      console.log('\n⚠️ Found path-related findings:');
      pathFindings.forEach(f => {
        console.log(`  - ${f.ruleId}: ${f.message}`);
      });
    }
    
    // Show a few other findings for context
    console.log('\nSample of other findings (first 5):');
    result.findings.slice(0, 5).forEach(f => {
      console.log(`  - ${f.ruleId}: ${f.message}`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testPathFix();
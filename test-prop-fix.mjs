import { gradeContract } from './dist/app/pipeline.js';

async function testPropStyleAPI() {
  console.log('Testing PROP-001 Style API (with /api/v2 in server URL)\n');
  console.log('='.repeat(60));
  
  try {
    const result = await gradeContract(
      { 
        path: './test-prop-001-style.yaml',
        templatePath: './templates/MASTER_API_TEMPLATE_v3.yaml'
      },
      { progress: () => {} }
    );
    
    console.log('\nGrading Results:');
    console.log(`  Score: ${result.grade.total}/100`);
    console.log(`  Grade: ${result.grade.letter}`);
    console.log(`  Total Findings: ${result.findings.length}`);
    
    // Check for the specific error message
    const pathPrefixErrors = result.findings.filter(f => 
      f.message?.includes('Missing /api/v2/ prefix') ||
      f.message?.includes('must start with /api/v2') ||
      (f.message?.includes('Path must start') && f.message?.includes('api/v2'))
    );
    
    if (pathPrefixErrors.length > 0) {
      console.log('\n❌ STILL GETTING PATH PREFIX ERRORS:');
      pathPrefixErrors.forEach(f => {
        console.log(`  - ${f.ruleId}: ${f.message}`);
      });
    } else {
      console.log('\n✅ SUCCESS: No /api/v2 prefix errors!');
    }
    
    // Check for any remaining path errors
    const anyPathErrors = result.findings.filter(f => 
      f.ruleId === 'NAME-NAMESPACE' || 
      f.ruleId === 'PATH-STRUCTURE' ||
      f.category === 'naming'
    );
    
    if (anyPathErrors.length > 0) {
      console.log('\nOther path/naming findings:');
      anyPathErrors.forEach(f => {
        console.log(`  - ${f.ruleId}: ${f.message}`);
      });
    }
    
    // Show breakdown
    console.log('\nScore Breakdown:');
    if (result.grade.perCategory) {
      Object.entries(result.grade.perCategory).forEach(([cat, scores]) => {
        console.log(`  ${cat}: ${scores}`);
      });
    }
    
    // List key findings
    console.log('\nKey Findings (first 10):');
    result.findings.slice(0, 10).forEach(f => {
      console.log(`  - [${f.severity}] ${f.ruleId}: ${f.message}`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testPropStyleAPI();
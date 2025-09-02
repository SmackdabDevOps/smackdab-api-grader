import fs from 'fs';
import { gradeContract } from './dist/app/pipeline.js';

async function testGrading() {
  try {
    console.log('Starting grading test...');
    
    // Grade test-api-v1.yaml
    console.log('\n=== Grading test-api-v1.yaml (with issues) ===');
    const result1 = await gradeContract(
      { path: './test-api-v1.yaml', templatePath: './templates/MASTER_API_TEMPLATE_v3.yaml' },
      { progress: (stage, percent, note) => console.log(`[${percent}%] ${stage}: ${note || ''}`) }
    );
    
    console.log('\nGrade v1:');
    console.log(`  Score: ${result1.grade.total}`);
    console.log(`  Letter: ${result1.grade.letter}`);
    console.log(`  Findings: ${result1.findings.length}`);
    console.log(`  Critical Issues: ${result1.grade.criticalIssues}`);
    console.log(`  Spec Hash: ${result1.metadata.specHash.slice(0, 8)}...`);
    
    // Save results for comparison
    fs.writeFileSync('/tmp/grade-v1-result.json', JSON.stringify(result1, null, 2));
    
    // Create improved version
    console.log('\n=== Creating improved test-api-v2.yaml ===');
    const v1Content = fs.readFileSync('./test-api-v1.yaml', 'utf8');
    
    // Fix the issues in v2
    let v2Content = v1Content
      // Add operationIds
      .replace('summary: Get products\n      description: List all products\n      # ISSUE 1:', 'summary: Get products\n      description: List all products\n      operationId: getProducts\n      # Fixed')
      .replace('summary: Create product\n      # ISSUE 6:', 'summary: Create product\n      operationId: createProduct\n      # Fixed')
      .replace('summary: Get product by ID\n      responses:', 'summary: Get product by ID\n      operationId: getProductById\n      responses:')
      // Add security
      .replace('# ISSUE 2: Missing security\n      # ISSUE 3:', 'security:\n        - apiKey: []\n      # ISSUE 3:')
      // Add components section
      .replace('# ISSUE 11: Missing components section with security schemes\n', `
components:
  securitySchemes:
    apiKey:
      type: apiKey
      in: header
      name: X-API-Key

# Fixed issues 11-14\n`);
    
    fs.writeFileSync('./test-api-v2.yaml', v2Content);
    
    // Grade improved version
    console.log('\n=== Grading test-api-v2.yaml (improved) ===');
    const result2 = await gradeContract(
      { path: './test-api-v2.yaml', templatePath: './templates/MASTER_API_TEMPLATE_v3.yaml' },
      { progress: (stage, percent, note) => console.log(`[${percent}%] ${stage}: ${note || ''}`) }
    );
    
    console.log('\nGrade v2:');
    console.log(`  Score: ${result2.grade.total}`);
    console.log(`  Letter: ${result2.grade.letter}`);
    console.log(`  Findings: ${result2.findings.length}`);
    console.log(`  Critical Issues: ${result2.grade.criticalIssues}`);
    console.log(`  Spec Hash: ${result2.metadata.specHash.slice(0, 8)}...`);
    
    fs.writeFileSync('/tmp/grade-v2-result.json', JSON.stringify(result2, null, 2));
    
    // Compare results
    console.log('\n=== Comparison ===');
    console.log(`Score improvement: ${result2.grade.total - result1.grade.total} points`);
    console.log(`Findings reduced by: ${result1.findings.length - result2.findings.length}`);
    console.log(`Grade changed from ${result1.grade.letter} to ${result2.grade.letter}`);
    
    // Check if grader detected the changes
    if (result2.grade.total > result1.grade.total) {
      console.log('\n✅ SUCCESS: Grader correctly detected improvements!');
      console.log('The caching issue has been resolved.');
    } else if (result2.grade.total === result1.grade.total && result1.metadata.specHash === result2.metadata.specHash) {
      console.log('\n❌ ISSUE: Same spec hash despite changes!');
      console.log('The file changes were not detected.');
    } else if (result2.grade.total === result1.grade.total && result1.metadata.specHash !== result2.metadata.specHash) {
      console.log('\n⚠️ WARNING: Different spec hash but same score');
      console.log('The grader detected changes but score remained the same.');
    }
    
  } catch (error) {
    console.error('Error during test:', error);
  }
}

testGrading();
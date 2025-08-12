const fs = require('fs');
const yaml = require('yaml');

// Load and parse the API spec
const specPath = './contracts/openapi/v2/grader-profile-system-api.yaml';
const specContent = fs.readFileSync(specPath, 'utf8');
const spec = yaml.parse(specContent);

console.log('Loaded API Spec:');
console.log('- OpenAPI:', spec.openapi);
console.log('- Title:', spec.info?.title);
console.log('- Version:', spec.info?.version);
console.log('- Paths:', Object.keys(spec.paths || {}).length);
console.log('- Has x-api-id:', Boolean(spec.info?.['x-api-id']));

// Now try to grade it
const { pipeline } = require('./dist/app/pipeline');

async function gradeAPI() {
  try {
    const result = await pipeline(specPath);
    console.log('\nGrading Result:');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error grading:', error.message);
  }
}

gradeAPI();

const fs = require('fs');
const yaml = require('yaml');
const { parseDocument } = require('yaml');

// Test loading like the grader does
const path = './test-minimal-api.yaml';
const raw = fs.readFileSync(path, 'utf8');

console.log('Raw file content:');
console.log(raw);
console.log('\n---\n');

// Parse like grader does
const doc = parseDocument(raw, { keepNodeTypes: true });
const spec = doc.toJS();

console.log('Parsed spec:');
console.log(JSON.stringify(spec, null, 2));
console.log('\nSpec fields:');
console.log('- openapi:', spec?.openapi);
console.log('- info:', spec?.info);
console.log('- paths:', spec?.paths);
console.log('- components:', spec?.components);

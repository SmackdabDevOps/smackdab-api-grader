#!/usr/bin/env node

import fs from 'fs';
import yaml from 'yaml';
import { RULE_ERROR_RESPONSES } from './dist/rules/registry.js';

const spec = yaml.parse(fs.readFileSync('/Users/brooksswift/Desktop/Smackdab/mock-product-api-perfect.yaml', 'utf8'));

// Detect targets
const targets = RULE_ERROR_RESPONSES.detect(spec);
console.log(`Found ${targets.length} targets to check for error handling\n`);

// Check each target
let failed = 0;
for (const target of targets.slice(0, 5)) {  // Check first 5
  const result = RULE_ERROR_RESPONSES.validate(target, spec);
  console.log(`${target.identifier}: ${result.passed ? '✅' : '❌'}`);
  if (!result.passed) {
    console.log(`  Message: ${result.message}`);
    failed++;
  }
}

console.log(`\n${failed} out of ${Math.min(5, targets.length)} failed`);

// Debug first operation
if (targets.length > 0) {
  const firstTarget = targets[0];
  console.log('\n=== Debugging first operation ===');
  console.log('Target:', firstTarget.identifier);
  
  // Get the operation
  const pathItem = spec.paths[firstTarget.path];
  const operation = pathItem[firstTarget.method];
  
  console.log('Response codes:', Object.keys(operation.responses || {}));
  
  // Check for error structure
  const errorCodes = ['400', '401', '403', '404', '409', '500'];
  for (const code of errorCodes) {
    const response = operation.responses?.[code];
    if (response) {
      const schema = response.content?.['application/json']?.schema;
      console.log(`  ${code}: has schema = ${!!schema}`);
      if (schema?.$ref) {
        const schemaName = schema.$ref.split('/').pop();
        const errorSchema = spec.components?.schemas?.[schemaName];
        console.log(`    -> ${schemaName} properties:`, Object.keys(errorSchema?.properties || {}));
      }
    }
  }
}
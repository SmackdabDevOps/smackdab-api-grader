#!/usr/bin/env node

// Test hasParameter function

import fs from 'fs';
import yaml from 'yaml';

const spec = yaml.parse(fs.readFileSync('/Users/brooksswift/Desktop/Smackdab/mock-product-api.yaml', 'utf8'));

// The hasParameter function from registry.ts
function hasParameter(operation, paramName, paramIn = 'header') {
  console.log(`  Checking for parameter: ${paramName} in ${paramIn}`);
  console.log(`  Operation has ${operation.parameters ? operation.parameters.length : 0} parameters`);
  
  if (!operation.parameters) return false;
  
  // Check direct parameters
  const directParam = operation.parameters.find((p) => 
    p.name === paramName && p.in === paramIn
  );
  if (directParam) {
    console.log('  Found as direct parameter');
    return true;
  }
  
  // Check referenced parameters - match both the actual param name and common ref patterns
  const refParam = operation.parameters.find((p) => {
    if (p.$ref) {
      console.log(`    Checking ref: ${p.$ref}`);
      // Check for various reference patterns:
      // - #/components/parameters/OrganizationHeader (where param name is X-Organization-ID)
      // - #/components/parameters/X-Organization-ID
      // - Contains the param name anywhere in the ref
      if (p.$ref.includes('OrganizationHeader')) {
        console.log('    ✓ Matched OrganizationHeader');
        return true;
      }
      if (p.$ref.includes(paramName)) {
        console.log(`    ✓ Matched ${paramName}`);
        return true;
      }
      if (p.$ref.includes(paramName.replace(/-/g, ''))) {
        console.log(`    ✓ Matched ${paramName.replace(/-/g, '')}`);
        return true; // X-Organization-ID -> XOrganizationID
      }
    }
    return false;
  });
  
  console.log(`  Result: ${!!refParam ? 'FOUND' : 'NOT FOUND'}`);
  return !!refParam;
}

// Test operations
const postOp = spec.paths['/api/v2/inventory/products'].post;
console.log('\n=== POST /api/v2/inventory/products ===');
const postResult = hasParameter(postOp, 'X-Organization-ID', 'header');
console.log(`Final result: ${postResult}\n`);

const patchOp = spec.paths['/api/v2/inventory/products/{id}'].patch;
console.log('\n=== PATCH /api/v2/inventory/products/{id} ===');
const patchResult = hasParameter(patchOp, 'X-Organization-ID', 'header');
console.log(`Final result: ${patchResult}\n`);

const deleteOp = spec.paths['/api/v2/inventory/products/{id}'].delete;
console.log('\n=== DELETE /api/v2/inventory/products/{id} ===');
const deleteResult = hasParameter(deleteOp, 'X-Organization-ID', 'header');
console.log(`Final result: ${deleteResult}\n`);
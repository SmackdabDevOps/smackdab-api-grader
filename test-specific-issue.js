#!/usr/bin/env node

// Test specific issues with the grader

import fs from 'fs';
import yaml from 'yaml';

const spec = yaml.parse(fs.readFileSync('/Users/brooksswift/Desktop/Smackdab/mock-product-api.yaml', 'utf8'));

// Check path-level parameters
console.log('\n=== Path-level Parameters ===');
const productsPath = spec.paths['/api/v2/inventory/products'];
console.log('Path parameters:', productsPath.parameters?.map(p => p.$ref || p.name));

// Check GET operation
const getOp = productsPath.get;
console.log('\nGET operation parameters:', getOp.parameters?.map(p => p.$ref || p.name));

// Check if grader sees path-level + operation-level parameters
console.log('\n=== Combined Parameters (what grader should see) ===');
const pathParams = productsPath.parameters || [];
const opParams = getOp.parameters || [];
console.log('Path-level:', pathParams.length, 'params');
console.log('Operation-level:', opParams.length, 'params');
console.log('Total should be:', pathParams.length + opParams.length);

// Check SEC-001 expectation
console.log('\n=== SEC-001 Check ===');
const hasOrgAtPath = pathParams.some(p => 
  p.$ref && p.$ref.includes('OrganizationHeader')
);
console.log('Has X-Organization-ID at path level:', hasOrgAtPath);

const hasOrgAtOp = opParams.some(p => 
  p.$ref && p.$ref.includes('OrganizationHeader')
);
console.log('Has X-Organization-ID at operation level:', hasOrgAtOp);

// Check SCALE-001 expectation  
console.log('\n=== SCALE-001 Check ===');
const paginationParams = ['AfterKey', 'BeforeKey', 'Limit'];
for (const param of paginationParams) {
  const found = opParams.some(p => 
    p.$ref && p.$ref.includes(param)
  );
  console.log(`Has ${param}:`, found);
}

// Check FUNC-003 expectation
console.log('\n=== FUNC-003 Check ===');
const response200 = getOp.responses?.['200'];
const schemaRef = response200?.content?.['application/json']?.schema?.$ref;
console.log('Response schema ref:', schemaRef);

if (schemaRef) {
  const schemaName = schemaRef.split('/').pop();
  const schema = spec.components?.schemas?.[schemaName];
  console.log(`${schemaName} has:`, {
    success: !!schema?.properties?.success,
    data: !!schema?.properties?.data,
    meta: !!schema?.properties?.meta,
    _links: !!schema?.properties?._links
  });
}
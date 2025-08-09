#!/usr/bin/env node

// Debug script to check prerequisite detection

import fs from 'fs';
import yaml from 'yaml';

const spec = yaml.parse(fs.readFileSync('/Users/brooksswift/Desktop/Smackdab/mock-product-api.yaml', 'utf8'));

// Check POST operation
const postOp = spec.paths['/api/v2/inventory/products'].post;
console.log('\n=== POST /api/v2/inventory/products ===');
console.log('Parameters:', JSON.stringify(postOp.parameters, null, 2));

// Check PATCH operation
const patchOp = spec.paths['/api/v2/inventory/products/{id}'].patch;
console.log('\n=== PATCH /api/v2/inventory/products/{id} ===');
console.log('Parameters:', JSON.stringify(patchOp.parameters, null, 2));

// Check DELETE operation
const deleteOp = spec.paths['/api/v2/inventory/products/{id}'].delete;
console.log('\n=== DELETE /api/v2/inventory/products/{id} ===');
console.log('Parameters:', JSON.stringify(deleteOp.parameters, null, 2));

// Check if OrganizationHeader is defined
console.log('\n=== OrganizationHeader Parameter Definition ===');
if (spec.components?.parameters?.OrganizationHeader) {
  console.log('Found:', JSON.stringify(spec.components.parameters.OrganizationHeader, null, 2));
} else {
  console.log('NOT FOUND in components.parameters');
}
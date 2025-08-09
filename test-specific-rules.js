#!/usr/bin/env node

// Test specific rules that are failing

import fs from 'fs';
import yaml from 'yaml';
import { RULE_REGISTRY } from './dist/rules/registry.js';

const spec = yaml.parse(fs.readFileSync('/Users/brooksswift/Desktop/Smackdab/mock-product-api.yaml', 'utf8'));

// Test rules that are incorrectly failing
const testRules = [
  'FUNC-003', // Response envelope - should pass!
  'SCALE-001', // Pagination - should pass!
  'SEC-001'    // X-Organization-ID on reads - should pass!
];

for (const ruleId of testRules) {
  const rule = RULE_REGISTRY[ruleId];
  if (!rule) continue;
  
  console.log(`\n=== ${ruleId}: ${rule.description} ===`);
  
  const targets = rule.detect(spec);
  console.log(`Detected ${targets.length} targets to check`);
  
  let passed = 0;
  let failed = 0;
  
  for (const target of targets) {
    const result = rule.validate(target, spec);
    if (result.passed) {
      passed++;
    } else {
      failed++;
      console.log(`  ❌ ${target.identifier}: ${result.message}`);
    }
  }
  
  console.log(`Summary: ${passed} passed, ${failed} failed`);
  
  // For response envelope, let's check what's actually there
  if (ruleId === 'FUNC-003') {
    const getProductsResponse = spec.paths['/api/v2/inventory/products'].get.responses['200'];
    console.log('\nActual GET /products response schema:');
    console.log('  Schema ref:', getProductsResponse?.content?.['application/json']?.schema?.$ref);
    
    const productListResponse = spec.components?.schemas?.ProductListResponse;
    console.log('\nProductListResponse schema has:');
    console.log('  - success:', !!productListResponse?.properties?.success);
    console.log('  - data:', !!productListResponse?.properties?.data);
    console.log('  - meta:', !!productListResponse?.properties?.meta);
    console.log('  - _links:', !!productListResponse?.properties?._links);
  }
  
  // For pagination, check what parameters exist
  if (ruleId === 'SCALE-001') {
    const getProducts = spec.paths['/api/v2/inventory/products'].get;
    console.log('\nGET /products has parameters:');
    for (const param of getProducts.parameters || []) {
      if (param.$ref) {
        const refName = param.$ref.split('/').pop();
        console.log(`  - ${refName} (ref)`);
      } else {
        console.log(`  - ${param.name}`);
      }
    }
    
    console.log('\nDefined pagination parameters:');
    console.log('  - AfterKey:', !!spec.components?.parameters?.AfterKey);
    console.log('  - BeforeKey:', !!spec.components?.parameters?.BeforeKey);
    console.log('  - Limit:', !!spec.components?.parameters?.Limit);
  }
}
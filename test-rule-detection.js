#!/usr/bin/env node

// Test the rule detection and validation

import fs from 'fs';
import yaml from 'yaml';
import { RULE_REGISTRY } from './dist/rules/registry.js';

const spec = yaml.parse(fs.readFileSync('/Users/brooksswift/Desktop/Smackdab/mock-product-api.yaml', 'utf8'));

// Test PREREQ-003 rule
const rule = RULE_REGISTRY['PREREQ-003'];
console.log('\n=== Testing PREREQ-003 Rule ===');
console.log('Description:', rule.description);

// Detect targets
const targets = rule.detect(spec);
console.log('\nDetected targets:', targets.length);

// Test validation for each target
for (const target of targets) {
  console.log(`\n--- ${target.identifier} ---`);
  console.log('Location:', target.location);
  
  const result = rule.validate(target, spec);
  console.log('Validation result:', result);
}
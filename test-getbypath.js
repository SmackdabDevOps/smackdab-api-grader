#!/usr/bin/env node

// Test getByPath function

import fs from 'fs';
import yaml from 'yaml';

const spec = yaml.parse(fs.readFileSync('/Users/brooksswift/Desktop/Smackdab/mock-product-api.yaml', 'utf8'));

// The getByPath function from registry.ts
function getByPath(obj, path) {
  // Improved JSON path resolver
  // Handle paths like: $.paths['/api/v2/users'].post
  const cleanPath = path.replace(/^\$\.?/, '');
  
  // Parse path segments, handling bracket notation
  const segments = [];
  let current = '';
  let inBracket = false;
  
  for (let i = 0; i < cleanPath.length; i++) {
    const char = cleanPath[i];
    
    if (char === '[') {
      if (current) {
        segments.push(current);
        current = '';
      }
      inBracket = true;
    } else if (char === ']') {
      if (inBracket && current) {
        // Remove quotes if present
        const cleaned = current.replace(/^['"]|['"]$/g, '');
        segments.push(cleaned);
        current = '';
      }
      inBracket = false;
    } else if (char === '.' && !inBracket) {
      if (current) {
        segments.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }
  
  if (current) {
    segments.push(current);
  }
  
  // Navigate the object
  let result = obj;
  for (const segment of segments) {
    if (!result || typeof result !== 'object') return undefined;
    result = result[segment];
  }
  
  return result;
}

// Test paths
const testPaths = [
  "$.paths['/api/v2/inventory/products'].post",
  "$.paths['/api/v2/inventory/products/{id}'].patch",
  "$.paths['/api/v2/inventory/products/{id}'].delete"
];

for (const path of testPaths) {
  console.log(`\n=== Testing: ${path} ===`);
  const operation = getByPath(spec, path);
  if (operation) {
    console.log('Found operation!');
    console.log('Parameters:', operation.parameters ? operation.parameters.length : 'none');
    if (operation.parameters) {
      console.log('First param:', JSON.stringify(operation.parameters[0], null, 2));
    }
  } else {
    console.log('NOT FOUND - getByPath returned undefined');
  }
}
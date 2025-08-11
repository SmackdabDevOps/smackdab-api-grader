#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Find all test files
const testFiles = glob.sync('test/**/*.test.ts', {
  cwd: '/Users/brooksswift/Desktop/api-grader-mcp-starter',
  absolute: true
});

console.log(`Found ${testFiles.length} test files to fix`);

let totalFixed = 0;

testFiles.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let modified = false;
  
  // Fix imports from src - add .js extension
  const importPatterns = [
    // Fix relative imports from src
    [/from '(\.\.\/)+src\/([^']+)'/g, "from '$1src/$2.js'"],
    [/from "(\.\.\/)+src\/([^"]+)"/g, 'from "$1src/$2.js"'],
    
    // Fix test helper imports  
    [/from '\.\/helpers\/([^']+)'/g, "from './helpers/$1.js'"],
    [/from "\.\/helpers\/([^"]+)"/g, 'from "./helpers/$1.js"'],
    
    // Fix relative imports within test
    [/from '(\.\.\/)+fixtures\/([^']+)'/g, "from '$1fixtures/$2.js'"],
    [/from "(\.\.\/)+fixtures\/([^"]+)"/g, 'from "$1fixtures/$2.js"'],
  ];
  
  importPatterns.forEach(([pattern, replacement]) => {
    const newContent = content.replace(pattern, (match, ...groups) => {
      // Skip if already has .js extension
      if (match.endsWith('.js\'') || match.endsWith('.js"')) {
        return match;
      }
      // Skip node modules
      if (match.includes('node:') || match.includes('@')) {
        return match;
      }
      modified = true;
      return match.replace(pattern, replacement);
    });
    content = newContent;
  });
  
  if (modified) {
    fs.writeFileSync(file, content);
    console.log(`Fixed imports in ${path.basename(file)}`);
    totalFixed++;
  }
});

console.log(`\nFixed imports in ${totalFixed} files`);
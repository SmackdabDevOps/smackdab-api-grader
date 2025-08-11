#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Function to calculate correct relative path
function getCorrectRelativePath(testFilePath) {
  // Get the directory depth from test root
  const testDir = path.dirname(testFilePath);
  const relativePath = path.relative('/Users/brooksswift/Desktop/api-grader-mcp-starter/test', testDir);
  const depth = relativePath.split(path.sep).length;
  
  // Build the correct relative path to src
  const dots = '../'.repeat(depth + 1);
  return dots + 'src';
}

// Find all test files
const { execSync } = require('child_process');
const testFiles = execSync('find /Users/brooksswift/Desktop/api-grader-mcp-starter/test -name "*.test.ts" -type f', { encoding: 'utf-8' })
  .trim()
  .split('\n')
  .filter(Boolean);

console.log(`Found ${testFiles.length} test files to fix`);

let totalFixed = 0;

testFiles.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  const originalContent = content;
  
  // Get the correct relative path for this file
  const correctPath = getCorrectRelativePath(file);
  
  // Fix all import patterns that incorrectly reference src
  const patterns = [
    // Match any relative path to src
    { 
      regex: /from ['"](\.\.[\/\\])+src[\/\\]/g,
      replacement: `from '${correctPath}/`
    },
    // Also fix helper imports
    {
      regex: /from ['"](\.\.[\/\\])+helpers[\/\\]/g,
      replacement: (match) => {
        const testDir = path.dirname(file);
        const relativePath = path.relative(testDir, '/Users/brooksswift/Desktop/api-grader-mcp-starter/test/helpers');
        return `from '${relativePath}/`;
      }
    }
  ];
  
  patterns.forEach(({ regex, replacement }) => {
    if (typeof replacement === 'string') {
      content = content.replace(regex, replacement);
    } else {
      content = content.replace(regex, replacement);
    }
  });
  
  if (content !== originalContent) {
    fs.writeFileSync(file, content);
    console.log(`Fixed: ${path.basename(path.dirname(file))}/${path.basename(file)}`);
    totalFixed++;
  }
});

console.log(`\nFixed ${totalFixed} files`);

// Special case: Fix helpers path for files that reference mock-factories
testFiles.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  
  // Check if file references mock-factories
  if (content.includes('mock-factories')) {
    const testDir = path.dirname(file);
    const helperPath = path.relative(testDir, '/Users/brooksswift/Desktop/api-grader-mcp-starter/test/helpers');
    
    content = content.replace(
      /from ['"][^'"]*mock-factories['"]/g,
      `from '${helperPath}/mock-factories'`
    );
    
    fs.writeFileSync(file, content);
  }
});

console.log('\nImport paths fixed based on directory depth!');
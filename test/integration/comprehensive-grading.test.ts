#!/usr/bin/env tsx

import { checkComprehensive } from './src/app/semantic/comprehensive.js';
import { parseDocument } from 'yaml';
import fs from 'fs/promises';

async function test() {
  const raw = await fs.readFile('/Users/brooksswift/Desktop/Smackdab/.claude/templates/MASTER_API_TEMPLATE_v3.yaml', 'utf8');
  const doc = parseDocument(raw);
  const spec = doc.toJS();
  
  const result = checkComprehensive(spec);
  
  console.log('Comprehensive Score:', result.score?.comprehensive);
  console.log('Auto-fail reasons:', result.autoFailReasons);
  console.log('Findings:', result.findings.length);
  console.log('Errors:', result.findings.filter(f => f.severity === 'error').length);
  console.log('Warnings:', result.findings.filter(f => f.severity === 'warn').length);
  
  console.log('\nError details:');
  result.findings
    .filter(f => f.severity === 'error')
    .forEach(f => console.log(`  [${f.ruleId}] ${f.message}`));
    
  console.log('\nWarning details:');
  result.findings
    .filter(f => f.severity === 'warn')
    .forEach(f => console.log(`  [${f.ruleId}] ${f.message}`));
}

test().catch(console.error);
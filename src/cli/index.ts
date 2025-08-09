#!/usr/bin/env node
import { gradeContract } from '../app/pipeline.js';

const pattern = process.argv[2];
if (!pattern) {
  console.error('Usage: smackdab-grade <path-to-spec>'); process.exit(1);
}
gradeContract({ path: pattern }, { progress:(s,p)=>process.stdout.write(`\r${s} ${p}%`) })
  .then(res => { console.log('\n', JSON.stringify(res, null, 2)); })
  .catch(err => { console.error(err); process.exit(1); });

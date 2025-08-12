#!/usr/bin/env node
/**
 * Context-Aware API Grader CLI v2
 * Intelligently grades APIs based on their detected type
 * No more rigid Smackdab-only rules!
 */

import { gradeContract } from '../app/pipeline-v2.js';

console.log(`
╔════════════════════════════════════════════════════════════════╗
║            Context-Aware API Grader v2.0                      ║
║                                                                ║
║  This grader adapts to your API type:                         ║
║  • REST APIs - Standard REST patterns                         ║
║  • GraphQL - GraphQL-specific rules                           ║
║  • Microservices - Service mesh patterns                      ║
║  • Enterprise SaaS - Multi-tenant requirements                ║
║  • Internal Tools - Relaxed requirements                      ║
╚════════════════════════════════════════════════════════════════╝
`);

const specPath = process.argv[2];
const profileOverride = process.argv[3]; // Optional: --profile=REST

if (!specPath) {
  console.error('Usage: grader-v2 <path-to-spec> [--profile=<type>]');
  console.error('\nAvailable profiles:');
  console.error('  - REST (Simple REST API)');
  console.error('  - Enterprise_SaaS (Multi-tenant SaaS like Smackdab)');
  console.error('  - GraphQL (GraphQL APIs)');
  console.error('  - Microservice (Service mesh microservices)');
  console.error('  - Custom (Internal tools)');
  process.exit(1);
}

// Parse profile override if provided
let profileType: string | undefined;
if (profileOverride?.startsWith('--profile=')) {
  profileType = profileOverride.replace('--profile=', '');
  console.log(`\n⚙️  Manual profile override: ${profileType}\n`);
}

gradeContract(
  { 
    path: specPath,
    profileOverride: profileType
  },
  { 
    progress: (stage: string, percent: number, note?: string) => {
      const bar = '█'.repeat(Math.floor(percent / 5)).padEnd(20, '░');
      process.stdout.write(`\r  ${bar} ${percent}% - ${note || stage}`);
      if (percent === 100) process.stdout.write('\n');
    }
  }
)
.then(result => {
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                    GRADING RESULTS                           ');
  console.log('═══════════════════════════════════════════════════════════════');
  
  console.log(`\n📊 Grade Summary:`);
  console.log(`   Score: ${result.grade.total}/100 (${result.grade.letter})`);
  console.log(`   Profile: ${result.context.profile}`);
  console.log(`   Detection Confidence: ${Math.round(result.context.detectionConfidence * 100)}%`);
  
  if (result.grade.blockedByPrerequisites) {
    console.log(`\n❌ Prerequisites Failed:`);
    result.grade.autoFailReasons.forEach((reason: string) => {
      // Only show the first line of multi-line messages
      const firstLine = reason.split('\n')[0];
      console.log(`   • ${firstLine}`);
    });
  } else {
    console.log(`\n✅ Prerequisites Passed!`);
  }
  
  if (result.context.skippedPrerequisites?.length > 0) {
    console.log(`\n📝 Context-Aware Adjustments:`);
    console.log(`   The following prerequisites were skipped for ${result.context.profileType} APIs:`);
    result.context.skippedPrerequisites.forEach((prereq: string) => {
      if (prereq === 'PREREQ-003') {
        console.log(`   • X-Organization-ID headers (not needed for ${result.context.profileType})`);
      } else {
        console.log(`   • ${prereq}`);
      }
    });
  }
  
  if (result.context.reasoning) {
    console.log(`\n🔍 Detection Details:`);
    console.log(`   Matched Patterns:`);
    result.context.reasoning.matchedPatterns.slice(0, 3).forEach((pattern: string) => {
      console.log(`   • ${pattern}`);
    });
    
    if (result.context.reasoning.missingIndicators?.length > 0) {
      console.log(`   Missing Indicators:`);
      result.context.reasoning.missingIndicators.slice(0, 3).forEach((indicator: string) => {
        console.log(`   • ${indicator}`);
      });
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('           Thank you for using Context-Aware Grader!          ');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('\n');
  
  // Exit with appropriate code
  process.exit(result.grade.total >= 70 ? 0 : 1);
})
.catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
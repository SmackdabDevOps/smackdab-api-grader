/**
 * Context-Aware Grading Pipeline v2
 * This pipeline detects the API type and applies appropriate grading rules
 * Replaces the rigid one-size-fits-all approach with intelligent adaptation
 */

import fs from 'node:fs/promises';
import { parseDocument } from 'yaml';
import crypto from 'node:crypto';
import { ProfileDetectionEngine } from './profiles/detection-engine.js';
import { ProfileManager } from './profiles/profile-manager.js';
import { checkProfileAwarePrerequisites, explainSkippedPrerequisites } from '../scoring/prerequisites-v2.js';
import { validateOpenAPI } from './linters/openapiValidator.js';
import { scoreWithDependencies } from '../scoring/dependencies.js';
import { calculateFinalGrade, generateGradeSummary } from '../scoring/finalizer.js';

type Finding = { 
  ruleId: string; 
  message: string; 
  severity: 'error' | 'warn' | 'info'; 
  jsonPath: string; 
  category?: string; 
  line?: number 
};

export interface GradingContext {
  spec: any;
  profile: any;
  detectionResult: any;
  skippedPrerequisites: string[];
}

export async function gradeWithContext(
  args: any,
  options: { progress: (s: string, p: number, note?: string) => void }
): Promise<any> {
  const { progress } = options;
  
  progress('initialization', 5, 'Starting context-aware grading');
  
  // Load the OpenAPI spec
  progress('load', 10, 'Loading API specification');
  const { js: spec, raw } = await loadSpec(args.path);
  const specHash = sha256(raw.replace('\r\n', '\n'));
  
  // Initialize profile system
  progress('profile-init', 15, 'Initializing profile system');
  const profileManager = new ProfileManager();
  await profileManager.initialize();
  
  // Detect API type/profile
  progress('detection', 20, 'Detecting API type');
  const detectionEngine = new ProfileDetectionEngine();
  const detectionResult = detectionEngine.detect(spec);
  
  console.log(`\n🔍 API Type Detection:`);
  console.log(`   Detected: ${detectionResult.detectedProfile} (${Math.round(detectionResult.confidence * 100)}% confidence)`);
  console.log(`   Matched patterns:`, detectionResult.reasoning.matchedPatterns.slice(0, 3).join(', '));
  
  // Get the profile or allow manual override
  let profile;
  if (args.profileOverride) {
    progress('profile-override', 25, `Using manual profile: ${args.profileOverride}`);
    profile = await profileManager.getProfileByType(args.profileOverride);
    console.log(`   ⚠️  Manual override: Using ${args.profileOverride} profile instead`);
  } else if (detectionResult.confidence < 0.85) {
    // Low confidence, use default
    progress('profile-default', 25, 'Low confidence detection, using default profile');
    profile = await profileManager.getDefaultProfile();
    console.log(`   ⚠️  Low confidence (${Math.round(detectionResult.confidence * 100)}%), using default REST profile`);
  } else {
    progress('profile-select', 25, `Using ${detectionResult.detectedProfile} profile`);
    profile = await profileManager.getProfileByType(detectionResult.detectedProfile) 
      || await profileManager.getDefaultProfile();
  }
  
  console.log(`\n📋 Grading Profile: ${profile.name}`);
  console.log(`   Type: ${profile.type}`);
  console.log(`   Prerequisites:`);
  console.log(`     - Authentication: ${profile.prerequisites.requiresAuthentication ? 'Required' : 'Optional'}`);
  console.log(`     - Multi-tenant headers: ${profile.prerequisites.requiresMultiTenantHeaders ? 'Required' : 'Not required'}`);
  console.log(`     - API ID: ${profile.prerequisites.requiresApiId ? 'Required' : 'Optional'}`);
  
  // Check profile-aware prerequisites
  progress('prerequisites', 30, 'Checking profile-specific prerequisites');
  const prereqResult = await checkProfileAwarePrerequisites(spec, profile);
  
  if (prereqResult.skippedPrerequisites.length > 0) {
    console.log(`\n✅ Prerequisites adjusted for ${profile.name}:`);
    console.log(explainSkippedPrerequisites(prereqResult.skippedPrerequisites, profile));
  }
  
  if (!prereqResult.passed) {
    // Prerequisites failed - but now with context!
    progress('fail-prerequisites', 100, 'Prerequisites not met for this API type');
    
    const findings = prereqResult.failures.map(f => ({
      ruleId: f.ruleId,
      message: f.message,
      severity: f.severity as 'error' | 'warn' | 'info',
      jsonPath: f.location,
      category: f.category,
      line: f.line
    }));
    
    const grade = {
      total: 0,
      letter: 'F',
      compliancePct: 0,
      autoFailTriggered: true,
      criticalIssues: findings.length,
      perCategory: {},
      autoFailReasons: prereqResult.failures.map(f => f.message),
      blockedByPrerequisites: true,
      prerequisiteFailures: prereqResult.failures.length,
      profile: profile.name,
      profileType: profile.type,
      detectionConfidence: detectionResult.confidence
    };
    
    return {
      grade,
      findings,
      checkpoints: [],
      context: {
        profile: profile.name,
        profileType: profile.type,
        detectionConfidence: detectionResult.confidence,
        skippedPrerequisites: prereqResult.skippedPrerequisites,
        reasoning: detectionResult.reasoning
      },
      metadata: {
        specHash,
        templateHash: 'context-aware-v2',
        rulesetHash: 'profile-based',
        templateVersion: '2.0.0',
        toolVersions: { grader: '2.0.0-context-aware' },
        scoringEngine: 'profile-based'
      }
    };
  }
  
  // Continue with validation
  progress('openapi-validate', 40, 'Validating OpenAPI structure');
  const oav = await validateOpenAPI(spec);
  const findings: Finding[] = [];
  findings.push(...oav.errors.map(e => ({ 
    ruleId: 'OAS-STRUCT', 
    message: e.message, 
    severity: 'error' as const, 
    jsonPath: e.path || '$' 
  })));
  findings.push(...oav.warnings.map(e => ({ 
    ruleId: 'OAS-STRUCT', 
    message: e.message, 
    severity: 'warn' as const, 
    jsonPath: e.path || '$' 
  })));
  
  // Apply profile-specific scoring
  progress('scoring', 60, `Applying ${profile.name} scoring rules`);
  const scoringResult = await applyProfileScoring(spec, profile, findings);
  
  // Calculate final grade with profile context
  progress('finalize', 90, 'Calculating context-aware grade');
  const finalGrade = calculateProfileAwareGrade(scoringResult, profile);
  
  progress('done', 100, 'Context-aware grading complete');
  
  return {
    grade: finalGrade,
    findings: scoringResult.findings,
    checkpoints: scoringResult.checkpoints || [],
    context: {
      profile: profile.name,
      profileType: profile.type,
      detectionConfidence: detectionResult.confidence,
      skippedPrerequisites: prereqResult.skippedPrerequisites,
      reasoning: detectionResult.reasoning,
      profileRules: profile.rules.length,
      priorityConfig: profile.priorityConfig
    },
    metadata: {
      specHash,
      templateHash: 'context-aware-v2',
      rulesetHash: `profile-${profile.type}`,
      templateVersion: '2.0.0',
      toolVersions: { grader: '2.0.0-context-aware' },
      scoringEngine: 'profile-based'
    }
  };
}

async function loadSpec(path: string) {
  const raw = await fs.readFile(path, 'utf8');
  const doc = parseDocument(raw, { keepNodeTypes: true } as any);
  const js = doc.toJS();
  
  if (!js || typeof js !== 'object') {
    throw new Error(`Failed to parse API specification from ${path}`);
  }
  
  return { js, raw };
}

function sha256(s: string) { 
  return crypto.createHash('sha256').update(s).digest('hex'); 
}

async function applyProfileScoring(spec: any, profile: any, findings: Finding[]): Promise<any> {
  // Apply profile-specific rule weights
  const weightedFindings = findings.map(f => {
    const rule = profile.rules.find((r: any) => r.rule_id === f.ruleId);
    if (rule) {
      return {
        ...f,
        weight: rule.weight,
        category: rule.category
      };
    }
    return f;
  });
  
  // Calculate scores based on profile priorities
  const categoryScores: Record<string, number> = {};
  for (const [category, weight] of Object.entries(profile.priorityConfig)) {
    const categoryFindings = weightedFindings.filter(f => 
      f.category === category || f.ruleId.startsWith(category.toUpperCase().slice(0, 3))
    );
    const maxScore = weight as number;
    const violations = categoryFindings.filter(f => f.severity === 'error').length;
    const score = Math.max(0, maxScore - (violations * 5));
    categoryScores[category] = score;
  }
  
  return {
    findings: weightedFindings,
    categoryScores,
    checkpoints: []
  };
}

function calculateProfileAwareGrade(scoringResult: any, profile: any): any {
  const totalPossible = Object.values(profile.priorityConfig).reduce((sum: number, w: any) => sum + w, 0);
  const totalEarned = Object.values(scoringResult.categoryScores).reduce((sum: number, s: any) => sum + s, 0);
  const percentage = (totalEarned / totalPossible) * 100;
  
  const letter = getLetterGrade(percentage);
  
  return {
    total: Math.round(percentage),
    letter,
    compliancePct: percentage / 100,
    autoFailTriggered: false,
    criticalIssues: scoringResult.findings.filter((f: any) => f.severity === 'error').length,
    perCategory: scoringResult.categoryScores,
    profile: profile.name,
    profileType: profile.type,
    adjustedForContext: true
  };
}

function getLetterGrade(percentage: number): string {
  if (percentage >= 97) return 'A+';
  if (percentage >= 93) return 'A';
  if (percentage >= 90) return 'A-';
  if (percentage >= 87) return 'B+';
  if (percentage >= 83) return 'B';
  if (percentage >= 80) return 'B-';
  if (percentage >= 70) return 'C';
  if (percentage >= 60) return 'D';
  return 'F';
}

// Export the new context-aware grading function
export { gradeWithContext as gradeContract };
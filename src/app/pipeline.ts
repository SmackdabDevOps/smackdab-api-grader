import fs from 'node:fs/promises';
import { parseDocument } from 'yaml';
import crypto from 'node:crypto';
import { validateOpenAPI } from './linters/openapiValidator.js';
import { runSpectral } from './linters/spectralRunner.js';
import { validateExamples } from './linters/examplesValidator.js';
import { loadTemplate } from './io/templateLoader.js';
import { checkTenancy } from './semantic/tenancy.js';
import { checkHttp } from './semantic/http.js';
import { checkHttpSemantics } from './semantic/http_semantics.js';
import { checkCaching } from './semantic/caching.js';
import { checkPagination } from './semantic/pagination.js';
import { checkEnvelope } from './semantic/envelope.js';
import { checkAsync } from './semantic/async.js';
import { checkWebhooks } from './semantic/webhooks.js';
import { checkI18n } from './semantic/i18n.js';
import { checkNaming } from './semantic/naming.js';
import { checkExtensions } from './semantic/extensions.js';
import { checkComprehensive } from './semantic/comprehensive.js';
import { CHECKPOINTS } from './checkpoints.js';
import { GraderDB } from '../mcp/persistence/db.js';

// New coverage-based scoring imports
import { checkPrerequisites, Finding as NewFinding } from '../scoring/prerequisites.js';
import { scoreWithDependencies } from '../scoring/dependencies.js';
import { calculateFinalGrade, generateGradeSummary } from '../scoring/finalizer.js';

type Finding = { ruleId:string; message:string; severity: 'error'|'warn'|'info'; jsonPath:string; category?:string; line?:number };

function letter(total:number){
  if (total >= 97) return 'A+';
  if (total >= 93) return 'A';
  if (total >= 90) return 'A-';
  if (total >= 87) return 'B+';
  if (total >= 83) return 'B';
  if (total >= 80) return 'B-';
  if (total >= 70) return 'C';
  if (total >= 60) return 'D';
  return 'F';
}

// Generate a unique instance ID at startup
const INSTANCE_ID = crypto.randomBytes(4).toString('hex');
const INSTANCE_START_TIME = new Date().toISOString();

export async function version() {
  const usesNewScoring = process.env.USE_LEGACY_SCORING !== 'true';
  return {
    serverVersion: usesNewScoring ? '2.0.0' : '1.2.0',
    scoringEngine: usesNewScoring ? 'coverage-based' : 'legacy',
    instanceId: INSTANCE_ID,
    instanceStartTime: INSTANCE_START_TIME,
    rulesetHash: 'dev-hash',
    templateVersion: '3.2.3',
    templateHash: 'dev-template',
    toolVersions: { 
      grader: usesNewScoring ? '2.0.0' : '1.2.0',
      scoringSystem: usesNewScoring ? 'coverage-based-v1' : 'legacy-binary'
    }
  };
}

async function loadSpec(path:string){
  const raw = await fs.readFile(path,'utf8');
  const doc = parseDocument(raw, { keepNodeTypes:true } as any);
  return { js: doc.toJS(), raw };
}

function sha256(s:string){ return crypto.createHash('sha256').update(s).digest('hex'); }

export async function gradeContract(args:any, {progress}:{progress:(s:string,p:number,note?:string)=>void}){
  const templatePath = args.templatePath || '.claude/templates/MASTER_API_TEMPLATE_v3.yaml';
  const useLegacyScoring = args.legacyMode || false;  // Backward compatibility flag
  
  progress('template', 5);
  const template = await loadTemplate(templatePath);

  progress('load', 10);
  const { js: spec, raw } = await loadSpec(args.path);
  const specHash = sha256(raw.replace('\r\n','\n'));

  // If using new scoring system, check prerequisites first
  if (!useLegacyScoring) {
    progress('prerequisites', 15);
    const prereqResult = await checkPrerequisites(spec);
    
    if (!prereqResult.passed) {
      // Prerequisites failed - return blocked score
      progress('fail-prerequisites', 100);
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
        prerequisiteFailures: prereqResult.failures.length
      };
      
      return {
        grade,
        findings,
        checkpoints: [],
        metadata: {
          specHash,
          templateHash: template.templateHash,
          rulesetHash: template.rulesetHash,
          templateVersion: '3.2.3',
          toolVersions: { grader: '2.0.0' },  // New version
          scoringEngine: 'coverage-based'
        }
      };
    }
  }

  progress('openapi-validate', 20);
  const oav = await validateOpenAPI(spec);
  const findings: Finding[] = [];
  findings.push(...oav.errors.map(e => ({ ruleId:'OAS-STRUCT', message:e.message, severity:'error' as const, jsonPath:e.path || '$' })));
  findings.push(...oav.warnings.map(e => ({ ruleId:'OAS-STRUCT', message:e.message, severity:'warn' as const, jsonPath:e.path || '$' })));

  if (oav.errors.find(e => e.message.includes('OpenAPI version must be 3.0.3'))) {
    progress('fail-oas', 100);
    const grade = { total: 0, letter: 'F', compliancePct: 0, autoFailTriggered: true, criticalIssues: findings.filter(f=>f.severity==='error').length, perCategory:{} as any, autoFailReasons:['OpenAPI version not 3.0.3'] };
    return { grade, findings, checkpoints: [], metadata: { specHash, templateHash: template.templateHash, rulesetHash: template.rulesetHash, templateVersion: '3.2.3', toolVersions: { grader: '1.2.0' } } };
  }

  progress('spectral', 40);
  const spectral = await runSpectral(spec, template.spectralYaml || '');
  findings.push(...(spectral.findings || []).map((f:any)=>({ ruleId: f.code || 'SPECTRAL', message: f.message, severity: (f.severity===0?'error':f.severity===1?'warn':'info') as any, jsonPath: (f.path||[]).join('.') })));

  progress('examples', 50);
  const ex = await validateExamples(spec);
  findings.push(...(ex.errors||[]).map((e:any)=>({ ruleId:'EXAMPLES', message:e.message, severity:'warn' as const, jsonPath:e.path || '$' })));

  // Branch based on scoring mode
  let grade: any;
  let checkpoints: any[];
  
  if (useLegacyScoring) {
    // Original scoring logic for backward compatibility
    progress('semantic', 80);
    const modules = [
      ['comprehensive', checkComprehensive],
      ['naming', checkNaming],
      ['caching', checkCaching],
      ['pagination', checkPagination],
      ['envelope', checkEnvelope],
      ['async', checkAsync],
      ['webhooks', checkWebhooks],
      ['i18n', checkI18n],
      ['extensions', checkExtensions],
    ] as const;

    let total = 0;
    const checkpointScores: Array<{checkpoint_id:string; category:string; max_points:number; scored_points:number}> = [];
    let autoFailReasons: string[] = [];
    let comprehensiveScore = 0;

    for (const [category, fn] of modules){
      const r = await fn(spec);
      findings.push(...(r.findings||[]));
      
      if (category === 'comprehensive' && (r.score as any)?.comprehensive) {
        comprehensiveScore = (r.score as any).comprehensive.add || 0;
      } else {
        for (const cp of CHECKPOINTS.filter(c => c.category === category)) {
          const violated = findings.some(f => f.ruleId === cp.id);
          const scored = violated ? 0 : cp.weight;
          checkpointScores.push({ checkpoint_id: cp.id, category: cp.category, max_points: cp.weight, scored_points: scored });
          total += scored;
          if (violated && cp.autoFail) autoFailReasons.push(cp.description);
        }
      }
      if ((r as any).autoFailReasons && (r as any).autoFailReasons.length) autoFailReasons.push(...(r as any).autoFailReasons);
    }
    
    if (comprehensiveScore > total) {
      total = comprehensiveScore;
    }

    if (total > 100) total = 100;
    const autoFail = autoFailReasons.length > 0;
    progress('scoring', 90);
    grade = { total: autoFail ? Math.min(total, 59) : total, letter: autoFail ? 'F' : letter(total), compliancePct: total/100, autoFailTriggered: autoFail, criticalIssues: findings.filter(f=>f.severity==='error').length, perCategory:{} as any, autoFailReasons };
    checkpoints = checkpointScores;
  } else {
    // New coverage-based scoring system
    progress('coverage-scoring', 80);
    
    // Score all rules with dependency awareness
    const ruleScores = scoreWithDependencies(spec);
    
    // Calculate final grade
    const gradeResult = calculateFinalGrade(ruleScores);
    
    // Convert findings to old format for compatibility
    const newFindings = gradeResult.findings.map(f => ({
      ruleId: f.ruleId,
      message: f.message,
      severity: f.severity as 'error' | 'warn' | 'info',
      jsonPath: f.location,
      category: f.category,
      line: f.line
    }));
    
    findings.push(...newFindings);
    
    // Build checkpoint scores for compatibility
    const checkpointScores: Array<{checkpoint_id:string; category:string; max_points:number; scored_points:number}> = [];
    for (const [ruleId, score] of ruleScores) {
      checkpointScores.push({
        checkpoint_id: ruleId,
        category: score.category,
        max_points: score.maxScore,
        scored_points: score.score
      });
    }
    
    progress('scoring', 90);
    
    // Build grade object in old format
    const perCategory: any = {};
    for (const cat of gradeResult.breakdown) {
      perCategory[cat.category] = {
        earned: cat.earnedPoints,
        max: cat.maxPoints,
        percentage: cat.percentage
      };
    }
    
    grade = {
      total: gradeResult.score,
      letter: gradeResult.grade,
      compliancePct: gradeResult.score / 100,
      autoFailTriggered: false,  // No more binary auto-fail
      criticalIssues: gradeResult.criticalFindings,
      perCategory,
      autoFailReasons: [],  // No auto-fail in new system
      coverageBased: true,  // Flag to indicate new scoring
      excellence: gradeResult.excellence,
      ruleScores: Object.fromEntries(
        Array.from(ruleScores.entries()).map(([id, score]) => [
          id, 
          {
            coverage: score.coverage,
            score: score.score,
            maxPoints: score.maxScore,
            applicable: score.applicable,
            targetsChecked: score.targetsChecked,
            targetsPassed: score.targetsPassed
          }
        ])
      )  // Add detailed rule scores
    };
    
    checkpoints = checkpointScores;
  }

  progress('done', 100);
  // Get version info for metadata
  const versionInfo = await version();
  
  return { 
    grade, 
    findings: stableSort(findings), 
    checkpoints, 
    metadata: { 
      specHash, 
      templateHash: template.templateHash, 
      rulesetHash: template.rulesetHash, 
      templateVersion: '3.2.3', 
      toolVersions: { grader: useLegacyScoring ? '1.2.0' : '2.0.0' },
      scoringEngine: useLegacyScoring ? 'legacy' : 'coverage-based',
      instanceId: versionInfo.instanceId,
      instanceStartTime: versionInfo.instanceStartTime,
      gradedAt: new Date().toISOString()
    } 
  };
}

function stableSort(findings: Finding[]): Finding[] {
  return findings.sort((a,b)=>{
    const sev = (s:string)=> s==='error'?0 : s==='warn'?1:2;
    const d = sev(a.severity)-sev(b.severity);
    if (d!==0) return d;
    if ((a.category||'') < (b.category||'')) return -1;
    if ((a.category||'') > (b.category||'')) return 1;
    if (a.ruleId < b.ruleId) return -1;
    if (a.ruleId > b.ruleId) return 1;
    if (a.jsonPath < b.jsonPath) return -1;
    if (a.jsonPath > b.jsonPath) return 1;
    return (a.line||0) - (b.line||0);
  });
}

export async function gradeInline(args:any, ctx:any){ 
  const tmp = '/tmp/inline-spec.yaml';
  await fs.writeFile(tmp, args.content, 'utf8');
  const res = await gradeContract({ path: tmp, templatePath: args.templatePath }, ctx);
  return res;
}

export async function listCheckpoints(){ return CHECKPOINTS; }

export async function registerOrIdentifyApi(args:any){ 
  // Simple content hash based ID if provided inline; else path-based
  const source = args.content ?? args.path ?? args.uri ?? Math.random().toString();
  const apiId = 'urn:smackdab:api:' + sha256(String(source)).slice(0,12);
  return { apiId, wroteToSpec: false };
}

export async function gradeAndRecord(args:any, {progress}:{progress:(s:string,p:number,note?:string)=>void}){
  const r = await gradeContract(args,{progress});
  const api = await registerOrIdentifyApi(args);
  const runId = 'run_' + sha256(JSON.stringify(r.metadata)+Date.now()).slice(0,12);
  const db = new GraderDB();
  await db.connect();
  await db.migrate();
  await db.insertRun({
    run_id: runId,
    api_id: api.apiId,
    graded_at: new Date().toISOString(),
    template_version: r.metadata.templateVersion,
    template_hash: r.metadata.templateHash,
    ruleset_hash: r.metadata.rulesetHash,
    spec_hash: r.metadata.specHash,
    total_score: r.grade.total,
    letter_grade: r.grade.letter,
    compliance_pct: r.grade.compliancePct,
    auto_fail: r.grade.autoFailTriggered ? 1 : 0,
    critical_issues: r.grade.criticalIssues,
    findings_count: r.findings.length,
    json_report: JSON.stringify(r)
  }, r.checkpoints.map((c:any)=>({ checkpoint_id: c.checkpoint_id, category: c.category, max_points: c.max_points, scored_points: c.scored_points })),
     r.findings.map((f:any)=>({ rule_id: f.ruleId, severity: f.severity, category: f.category, json_path: f.jsonPath, line: f.line, message: f.message }))
  );
  return { runId, apiId: api.apiId, ...r };
}


import { generateFixes } from './fixes/fixesEngine.js';
import { applyPatches } from './patching/applyPatches.js';
// GraderDB already imported above
import { getTopViolations } from './analytics/trends.js';

export async function suggestFixes(args:any){
  const path = args.path;
  const { js, raw } = await loadSpec(path);
  const r = await gradeContract({ path }, { progress: ()=>{} });
  const fixes = generateFixes(r.findings, raw);
  return { count: fixes.length, fixes };
}

export async function applyFixes(args:any){
  const { path, fixes, dryRun=true, backup=true } = args;
  const patches = fixes.map((f:any)=>f.patch);
  return await applyPatches(path, patches, dryRun, backup);
}

export async function explainFinding(args:any){
  // Minimal explainer; can be expanded with template excerpts
  const { ruleId } = args;
  const cp = CHECKPOINTS.find(c=>c.id===ruleId);
  if (!cp) return { ruleId, explanation: 'Unknown rule' };
  return { ruleId, explanation: `${cp.description} — weight ${cp.weight}${cp.autoFail?' (auto-fail)':''}` };
}

export async function compareRuns(args:any){
  const db = new GraderDB();
  await db.connect();
  await db.migrate();
  const base = await (db as any).db!.get(`SELECT * FROM run WHERE run_id = ?`, args.baselineRunId);
  const cand = await (db as any).db!.get(`SELECT * FROM run WHERE run_id = ?`, args.candidateRunId);
  if (!base || !cand) throw new Error('Run(s) not found');
  return {
    baseline: { run_id: base.run_id, score: base.total_score, letter: base.letter_grade, graded_at: base.graded_at },
    candidate: { run_id: cand.run_id, score: cand.total_score, letter: cand.letter_grade, graded_at: cand.graded_at },
    delta: cand.total_score - base.total_score
  };
}

export async function topViolations(args:any){
  const rows = await getTopViolations(args.limit ?? 10);
  return { rows };
}

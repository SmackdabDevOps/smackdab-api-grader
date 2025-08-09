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

export async function version() {
  return {
    serverVersion: '1.2.0',
    rulesetHash: 'dev-hash',
    templateVersion: '3.2.3',
    templateHash: 'dev-template',
    toolVersions: { grader: '1.2.0' }
  };
}

async function loadSpec(path:string){
  const raw = await fs.readFile(path,'utf8');
  const doc = parseDocument(raw, { keepCstNodes:true, keepNodeTypes:true });
  return { js: doc.toJS(), raw };
}

function sha256(s:string){ return crypto.createHash('sha256').update(s).digest('hex'); }

export async function gradeContract(args:any, {progress}:{progress:(s:string,p:number,note?:string)=>void}){
  const templatePath = args.templatePath || '.claude/templates/MASTER_API_TEMPLATE_v3.yaml';
  progress('template', 5);
  const template = await loadTemplate(templatePath);

  progress('load', 10);
  const { js: spec, raw } = await loadSpec(args.path);
  const specHash = sha256(raw.replace('\r\n','\n'));

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

  progress('semantic', 80);
  const modules = [
    ['comprehensive', checkComprehensive],
    ['naming', checkNaming],
    ['security', checkTenancy],
    ['http', checkHttp],
    ['http', checkHttpSemantics],
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

  for (const [category, fn] of modules){
    const r = await fn(spec);
    findings.push(...(r.findings||[]));
    // Map module outputs back to checkpoint weights where possible
    // We mark a checkpoint as fully earned if no finding with that ruleId exists.
    for (const cp of CHECKPOINTS.filter(c => c.category === category)) {
      const violated = findings.some(f => f.ruleId === cp.id);
      const scored = violated ? 0 : cp.weight;
      checkpointScores.push({ checkpoint_id: cp.id, category: cp.category, max_points: cp.weight, scored_points: scored });
      total += scored;
      if (violated && cp.autoFail) autoFailReasons.push(cp.description);
    }
    // Respect module-provided auto-fail reasons too
    if (r.autoFailReasons && r.autoFailReasons.length) autoFailReasons.push(...r.autoFailReasons);
  }

  if (total > 100) total = 100;
  const autoFail = autoFailReasons.length > 0;
  progress('scoring', 90);
  const grade = { total: autoFail ? Math.min(total, 59) : total, letter: autoFail ? 'F' : letter(total), compliancePct: total/100, autoFailTriggered: autoFail, criticalIssues: findings.filter(f=>f.severity==='error').length, perCategory:{} as any, autoFailReasons };
  const checkpoints = checkpointScores;

  progress('done', 100);
  return { grade, findings: stableSort(findings), checkpoints, metadata: { specHash, templateHash: template.templateHash, rulesetHash: template.rulesetHash, templateVersion: '3.2.3', toolVersions: { grader: '1.2.0' } } };
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
import { GraderDB } from '../mcp/persistence/db.js';
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

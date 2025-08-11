import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

// Agent name from env or config
const agent_name = process.env.TDE_AGENT_NAME ?? 'test-development-engineer';
const run_id = process.env.TDE_RUN_ID || crypto.randomUUID();
const log_dir = path.join(process.env.TDE_LOG_DIR || './logs', agent_name);

// Create directory with secure permissions
try {
  fs.mkdirSync(log_dir, { recursive: true, mode: 0o750 });
} catch (e) {
  console.error(`FATAL: logging unavailable at ${log_dir}. Check permissions/path.`);
  process.exit(1);
}

// Generate Windows-safe timestamp with TRUE local time
function getTimestamps() {
  const d = new Date();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const offMin = -d.getTimezoneOffset(); // minutes east of UTC
  const sign = offMin >= 0 ? '+' : '-';
  const hh = String(Math.floor(Math.abs(offMin) / 60)).padStart(2, '0');
  const mm = String(Math.abs(offMin) % 60).padStart(2, '0');
  
  return {
    ts_utc: d.toISOString(),
    ts_local: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}${sign}${hh}:${mm}`,
    tz,
    filename: d.toISOString().replace(/T/, '_').replace(/:/g, '-').substring(0, 19)
  };
}

const { filename } = getTimestamps();
const log_file = path.join(log_dir, `${agent_name}__${filename}__.log.jsonl`);
const latest_link = path.join(log_dir, 'latest.log.jsonl');

// Atomic creation of latest.log.jsonl
const tmp = `${latest_link}.tmp`;
fs.writeFileSync(tmp, '', { mode: 0o640 });
fs.renameSync(tmp, latest_link);

// Open log file with secure permissions
const log_fd = fs.openSync(log_file, 'a', 0o640);

export function logEvent(event: any): void {
  const stamps = getTimestamps();
  const fullEvent = {
    ...stamps,
    run_id,
    agent: agent_name,
    ...event
  };
  const line = JSON.stringify(fullEvent) + '\n';
  fs.appendFileSync(log_file, line);
  fs.appendFileSync(latest_link, line);
}

// Self-canary test BEFORE anything else
function selfCanary(): boolean {
  const checks = [
    { name: 'Math works', ok: () => 1 + 1 === 2 },
    { name: 'Logs writable', ok: () => { fs.appendFileSync(log_file, ''); return true; } },
  ];

  for (const c of checks) {
    try {
      if (!c.ok()) {
        logEvent({ action: 'canary_failed', status: 'error', message: `Self-test failed: ${c.name}` });
        return false;
      }
    } catch (e) {
      logEvent({ action: 'canary_error', status: 'error', message: `Canary threw: ${c.name}`, error: String(e) });
      return false;
    }
  }
  return true;
}

// Run canary and abort if fails
if (!selfCanary()) {
  console.error('FATAL: Self-canary tests failed. Environment not ready.');
  process.exit(1);
}

// Log session start
const stamps = getTimestamps();
logEvent({
  action: 'session_started',
  status: 'info',
  message: 'Test Development Engineer initialized',
  version: 'tde_v2',
  mode: process.env.TDE_DRY_RUN ? 'dry-run' : 'normal'
});

export function executeCommand(
  cmd: string, 
  args: string[], 
  options: {
    env?: NodeJS.ProcessEnv,
    cwd?: string,
    timeout?: number,
    label?: string,
    expectedExitCode?: number
  } = {}
): any {
  const label = options.label || 'test';
  const dir = path.join('.tde_artifacts', run_id);
  fs.mkdirSync(dir, { recursive: true, mode: 0o750 });
  
  const outPath = path.join(dir, `${label}.out.txt`);
  const errPath = path.join(dir, `${label}.err.txt`);
  
  // Merge environment with deterministic settings
  const execEnv = {
    ...process.env,
    ...options.env,
    TZ: 'UTC',
    LC_ALL: 'en_US.UTF-8',
    NODE_ENV: 'test',
    CI: '1',
    FORCE_COLOR: '0',
    RANDOM_SEED: '1337',
    TDE_RUN_ID: run_id
  };
  
  // Execute with timing
  const t0 = Date.now();
  const result = spawnSync(cmd, args, {
    env: execEnv,
    cwd: options.cwd || process.cwd(),
    encoding: 'utf8',
    timeout: options.timeout || 120000,
    maxBuffer: 10 * 1024 * 1024 // 10MB
  });
  const duration = Date.now() - t0;
  
  // Normalize line endings for cross-platform consistency
  const stdout = (result.stdout || '').replace(/\r\n/g, '\n');
  const stderr = (result.stderr || '').replace(/\r\n/g, '\n');
  
  // Write outputs
  fs.writeFileSync(outPath, stdout, { mode: 0o640 });
  fs.writeFileSync(errPath, stderr, { mode: 0o640 });
  
  // Log execution
  logEvent({
    action: 'command_executed',
    command: `${cmd} ${args.join(' ')}`,
    exit_code: result.status ?? (result.error ? 1 : 0),
    duration_ms: duration,
    artifacts: [outPath, errPath],
    stdout_preview: stdout.slice(0, 200),
    stderr_preview: stderr.slice(0, 200),
    stdout_lines: stdout.split('\n').length,
    stderr_lines: stderr.split('\n').length
  });
  
  // Check expected exit code
  if (options.expectedExitCode !== undefined && result.status !== options.expectedExitCode) {
    logEvent({
      action: 'unexpected_exit',
      status: 'error',
      expected: options.expectedExitCode,
      actual: result.status,
      message: `Expected exit code ${options.expectedExitCode}, got ${result.status}`
    });
  }
  
  return {
    stdout,
    stderr,
    exitCode: result.status ?? (result.error ? 1 : 0),
    duration,
    signal: result.signal,
    error: result.error
  };
}

export { run_id, log_file };
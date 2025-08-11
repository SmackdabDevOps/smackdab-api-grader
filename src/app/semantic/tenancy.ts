export interface Finding { ruleId: string; severity: 'error'|'warn'|'info'; message: string; jsonPath: string; category?: string; line?: number; }

// Helper to resolve $ref pointers
function resolveRef(spec: any, ref: string): any {
  if (!ref || !ref.startsWith('#/')) return null;
  const path = ref.substring(2).split('/');
  let current = spec;
  for (const segment of path) {
    if (!current || typeof current !== 'object') return null;
    current = current[segment];
  }
  return current;
}

function opEntries(paths:any) {
  const out: Array<{ pathKey: string; method: string; op: any; pathItem: any }> = [];
  if (!paths) return out;
  for (const pathKey of Object.keys(paths)) {
    const pathItem = paths[pathKey] || {};
    for (const method of ['get','post','patch','delete','put','options','head']) {
      if (pathItem[method]) out.push({ pathKey, method, op: pathItem[method], pathItem });
    }
  }
  return out;
}

// Check if effective parameters (path + operation level) contain a specific parameter ref
function hasParamRef(spec:any, pathItem:any, op:any, ref:string): boolean {
  // Check path-level parameters
  const pathParams = pathItem?.parameters || [];
  for (const param of pathParams) {
    if (param?.$ref === ref) return true;
    // Also check if the resolved parameter matches what we're looking for
    if (param?.$ref) {
      const resolved = resolveRef(spec, param.$ref);
      if (resolved && param.$ref === ref) return true;
    }
  }
  
  // Check operation-level parameters (they override path-level)
  const opParams = op?.parameters || [];
  for (const param of opParams) {
    if (param?.$ref === ref) return true;
    // Also check if the resolved parameter matches what we're looking for
    if (param?.$ref) {
      const resolved = resolveRef(spec, param.$ref);
      if (resolved && param.$ref === ref) return true;
    }
  }
  
  return false;
}

export function checkTenancy(spec:any){
  const findings: Finding[] = [];
  let scoreAdd = 0;
  const scoreMax = 15; // category budget; split across checks
  let orgOk = true, branchOk = true, scopesOk = true, apiKeyOk = true, bearerOk = true;

  const entries = opEntries(spec?.paths);
  for (const { pathKey, method, op, pathItem } of entries) {
    // Require org header ref (check both path and operation level parameters)
    const hasOrg = hasParamRef(spec, pathItem, op, '#/components/parameters/OrganizationHeader');
    if (!hasOrg) {
      orgOk = false;
      findings.push({ ruleId: 'SEC-ORG-HDR', severity: 'error', category:'security', message: 'Missing X-Organization-ID (OrganizationHeader) on operation', jsonPath: `$.paths['${pathKey}'].${method}.parameters` });
    }
    // Require branch header ref (optional overall but expected in Smackdab)
    const hasBranch = hasParamRef(spec, pathItem, op, '#/components/parameters/BranchHeader');
    if (!hasBranch) {
      branchOk = false;
      findings.push({ ruleId: 'SEC-BRANCH-HDR', severity: 'error', category:'security', message: 'Missing X-Branch-ID (BranchHeader) on operation', jsonPath: `$.paths['${pathKey}'].${method}.parameters` });
    }
  }

  // Security schemes quick checks (presence only)
  const sec = spec?.components?.securitySchemes || {};
  if (!sec?.OAuth2) {
    scopesOk = false;
    findings.push({ ruleId:'SEC-OAUTH2', severity:'error', category:'security', message:'OAuth2 security scheme missing (OAuth2)', jsonPath:'$.components.securitySchemes' });
  }
  if (sec?.ApiKeyAuth && sec?.ApiKeyAuth?.in !== 'header') {
    apiKeyOk = false;
    findings.push({ ruleId:'SEC-APIKEY', severity:'warn', category:'security', message:'ApiKeyAuth must be in header', jsonPath:'$.components.securitySchemes.ApiKeyAuth' });
  }
  if (sec?.BearerAuth && sec?.BearerAuth?.type !== 'http') {
    bearerOk = false;
    findings.push({ ruleId:'SEC-BEARER', severity:'warn', category:'security', message:'BearerAuth must be type http', jsonPath:'$.components.securitySchemes.BearerAuth' });
  }

  // Simple scoring: allocate points for each satisfied cluster
  if (orgOk) scoreAdd += 4;
  if (branchOk) scoreAdd += 3;
  if (scopesOk) scoreAdd += 4;
  if (apiKeyOk) scoreAdd += 2;
  if (bearerOk) scoreAdd += 2;

  // Auto-fail if any org header missing anywhere
  const autoFail = !orgOk;

  return { findings, score: { tenancy: { add: scoreAdd, max: scoreMax } }, autoFailReasons: autoFail ? ['Missing X-Organization-ID on one or more operations'] : [] };
}

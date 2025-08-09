export interface Finding { ruleId: string; severity: 'error'|'warn'|'info'; message: string; jsonPath: string; category?: string; line?: number; }

function opEntries(paths:any) {
  const out: Array<{ pathKey: string; method: string; op: any }> = [];
  if (!paths) return out;
  for (const pathKey of Object.keys(paths)) {
    const item = paths[pathKey] || {};
    for (const method of ['get','post','patch','delete']) {
      if (item[method]) out.push({ pathKey, method, op: item[method] });
    }
  }
  return out;
}

function hasParamRef(op:any, ref:string): boolean {
  const arr = op?.parameters || [];
  return arr.some((p:any) => typeof p?.['$ref'] === 'string' && p['$ref'] === ref);
}

function hasQueryParam(op:any, name:string): boolean {
  const arr = op?.parameters || [];
  return arr.some((p:any) => p?.in === 'query' && p?.name === name);
}

export function checkPagination(spec:any){
  const findings: Finding[] = [];
  let scoreAdd = 0;
  const scoreMax = 8;
  let keysetOk = true;
  let filtersOk = true;
  let sortOk = true;

  for (const { pathKey, method, op } of opEntries(spec?.paths)) {
    if (method !== 'get') continue;

    // Detect list-y endpoints: no trailing path param placeholder
    const looksLikeList = !pathKey.match(/\{[^}]+\}$/);
    if (!looksLikeList) continue;

    // Auto-fail if offset/page present
    const hasOffset = hasQueryParam(op, 'offset') || hasQueryParam(op, 'page') || hasQueryParam(op, 'page_size') || hasQueryParam(op, 'pageNumber');
    if (hasOffset) {
      keysetOk = false;
      findings.push({ ruleId:'PAG-OFFSET', severity:'error', category:'pagination', message:'Offset/page pagination detected; Smackdab requires key-set (after_key/before_key).', jsonPath:`$.paths['${pathKey}'].${method}.parameters` });
    }

    // Require key-set params
    const hasAfter = hasParamRef(op, '#/components/parameters/AfterKey');
    const hasBefore = hasParamRef(op, '#/components/parameters/BeforeKey');
    const hasLimit = hasParamRef(op, '#/components/parameters/Limit');
    if (!(hasAfter && hasBefore && hasLimit)) {
      keysetOk = false;
      findings.push({ ruleId:'PAG-KEYSET', severity:'error', category:'pagination', message:'Missing key-set pagination parameters (AfterKey/BeforeKey/Limit).', jsonPath:`$.paths['${pathKey}'].${method}.parameters` });
    }

    // Sort regex (basic heuristic)
    const hasSort = hasParamRef(op, '#/components/parameters/Sort');
    if (!hasSort) {
      sortOk = false;
      findings.push({ ruleId:'PAG-SORT', severity:'warn', category:'pagination', message:'Missing Sort parameter reference.', jsonPath:`$.paths['${pathKey}'].${method}.parameters` });
    }
  }

  if (keysetOk) scoreAdd += 5;
  if (filtersOk) scoreAdd += 2;
  if (sortOk) scoreAdd += 1

  const autoFailReasons = keysetOk ? [] : ['Offset/page pagination detected or missing key-set params'];

  return { findings, score: { pagination: { add: scoreAdd, max: scoreMax } }, autoFailReasons };
}

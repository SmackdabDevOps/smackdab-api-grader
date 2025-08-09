export function checkNaming(spec:any){
  const findings:any[] = [];
  let ok = true;
  for (const p of Object.keys(spec?.paths || {})) {
    if (!p.startsWith('/api/v2/')) {
      ok = false;
      findings.push({ ruleId:'NAME-NAMESPACE', severity:'error', category:'naming', message:'All paths must start with /api/v2/<domain>', jsonPath:`$.paths['${p}']` });
    }
  }
  const add = ok ? 10 : 6;
  return { findings, score: { naming: { add, max: 10 } }, autoFailReasons: ok ? [] : ['Missing /api/v2 namespace on one or more paths'] };
}

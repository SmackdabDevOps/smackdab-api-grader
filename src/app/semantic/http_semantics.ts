export function checkHttpSemantics(spec:any){
  const findings: Array<{ruleId:string; severity:'error'|'warn'|'info'; jsonPath:string; message:string; category?:string}> = [];
  const paths = spec.paths || {};
  const cacheable = new Set(['get', 'head']);
  const wantsRateLimit = new Set([200,201,202,204,429]);

  for (const [p,ops] of Object.entries<any>(paths)){
    for (const [m, op] of Object.entries<any>(ops)){
      const method = m.toLowerCase();
      const responses = op?.responses || {};
      // ETag on cacheables
      if (cacheable.has(method as any)){
        for (const [code, r] of Object.entries<any>(responses)){
          const c = parseInt(code,10);
          if (!isNaN(c) && c>=200 && c<300){
            const headers = r?.headers || {};
            if (!('ETag' in headers)){
              findings.push({ ruleId: 'HTTP-ETAG', severity: 'warn', jsonPath: `$.paths['${p}'].${method}.responses['${code}'].headers`, message: 'Missing ETag header on cacheable response', category: 'http' });
            }
          }
        }
      }
      // 304 for conditional GET
      if (method === 'get'){
        const has304 = responses['304'];
        if (!has304){
          findings.push({ ruleId: 'HTTP-304', severity: 'warn', jsonPath: `$.paths['${p}'].get.responses`, message: 'Missing 304 Not Modified for conditional GET', category: 'http' });
        }
      }
      // Problem+JSON on errors
      for (const [code, r] of Object.entries<any>(responses)){
        const c = parseInt(code,10);
        if (!isNaN(c) && c>=400){
          const content = r?.content || {};
          if (!('application/problem+json' in content)){
            findings.push({ ruleId: 'ERR-PROBLEMJSON', severity: 'error', jsonPath: `$.paths['${p}'].${method}.responses['${code}'].content`, message: 'Errors must use application/problem+json', category: 'responses' });
          }
        }
      }
      // Rate-limit headers
      for (const [code, r] of Object.entries<any>(responses)){
        const c = parseInt(code,10);
        if (!isNaN(c) && wantsRateLimit.has(c)){
          const headers = r?.headers || {};
          const required = ['X-RateLimit-Limit','X-RateLimit-Remaining','X-RateLimit-Reset'];
          for (const h of required){
            if (!(h in headers)){
              findings.push({ ruleId: 'HTTP-RATE-LIMIT', severity: 'warn', jsonPath: `$.paths['${p}'].${method}.responses['${code}'].headers`, message: `Missing ${h} header on ${code} response`, category: 'http' });
            }
          }
        }
      }
      // Async job semantics
      if (responses['202']){
        const r = responses['202'];
        const headers = r?.headers || {};
        if (!('Location' in headers)){
          findings.push({ ruleId: 'HTTP-202-LOCATION', severity: 'error', jsonPath: `$.paths['${p}'].${method}.responses['202'].headers`, message: '202 Accepted must include Location header pointing to job status', category: 'http' });
        }
      }
    }
  }
  return { findings };
}

interface Finding {
  ruleId: string;
  severity: 'error' | 'warn' | 'info';
  message: string;
  jsonPath: string;
  category: string;
}

interface I18nCheckResult {
  findings: Finding[];
  score: {
    i18n: {
      add: number;
      max: number;
    };
  };
}

export function checkI18n(spec: any): I18nCheckResult {
  const findings: Finding[] = [];
  let score = 6; // Start with max score
  const maxScore = 6;

  // Handle edge cases
  if (!spec || !spec.paths) {
    return {
      findings: [],
      score: { i18n: { add: 6, max: maxScore } }
    };
  }

  // Track i18n patterns found
  let hasAcceptLanguageParams = false;
  let hasContentLanguageHeaders = false;
  let hasMultiLanguageErrors = false;
  let hasLocalizedResponses = false;
  let hasVaryHeader = false;
  let pathsWithI18n = 0;
  let totalPaths = 0;

  // Check each path
  for (const [path, pathItem] of Object.entries(spec.paths || {})) {
    if (!pathItem || typeof pathItem !== 'object') continue;

    // Check each operation
    for (const [method, operation] of Object.entries(pathItem as any)) {
      if (!operation || typeof operation !== 'object') continue;
      if (['parameters', 'servers', 'summary', 'description'].includes(method)) continue;

      const op = operation as any;
      totalPaths++;
      let hasI18nSupport = false;

      // Check for Accept-Language parameter
      const parameters = op.parameters || [];
      const hasAcceptLanguage = parameters.some((param: any) => 
        param.in === 'header' && 
        (param.name === 'Accept-Language' || param.name === 'accept-language')
      );
      
      if (hasAcceptLanguage) {
        hasAcceptLanguageParams = true;
        hasI18nSupport = true;
      }

      // Check responses
      const responses = op.responses || {};
      
      for (const [statusCode, response] of Object.entries(responses)) {
        if (!response || typeof response !== 'object') continue;
        const resp = response as any;
        
        // Check for Content-Language header
        if (resp.headers) {
          if (resp.headers['Content-Language'] || resp.headers['content-language']) {
            hasContentLanguageHeaders = true;
            hasI18nSupport = true;
          }
          if (resp.headers['Vary']) {
            const varySchema = resp.headers['Vary'].schema || {};
            if (varySchema.example && varySchema.example.includes('Accept-Language')) {
              hasVaryHeader = true;
            }
          }
        }

        // Check for localized error messages
        if (statusCode.startsWith('4') || statusCode.startsWith('5')) {
          if (resp.content && resp.content['application/json']) {
            const schema = resp.content['application/json'].schema;
            if (schema && schema.properties) {
              if (schema.properties.locale || schema.properties.language) {
                hasMultiLanguageErrors = true;
                hasI18nSupport = true;
              }
            }
          }
        }
      }

      if (hasI18nSupport) {
        pathsWithI18n++;
      }
    }
  }

  // Apply scoring based on findings
  if (!hasAcceptLanguageParams) {
    findings.push({
      ruleId: 'I18N-ACCEPT-LANG',
      severity: 'warn',
      message: 'No Accept-Language header support found',
      jsonPath: '$.paths',
      category: 'i18n'
    });
    score -= 2;
  }

  if (!hasContentLanguageHeaders) {
    findings.push({
      ruleId: 'I18N-CONTENT-LANG',
      severity: 'warn',
      message: 'No Content-Language response headers found',
      jsonPath: '$.paths',
      category: 'i18n'
    });
    score -= 2;
  }

  if (!hasMultiLanguageErrors && !hasLocalizedResponses) {
    findings.push({
      ruleId: 'I18N-LOCALIZATION',
      severity: 'info',
      message: 'No localized content or error messages found',
      jsonPath: '$.paths',
      category: 'i18n'
    });
    score -= 1;
  }

  // Coverage check
  if (totalPaths > 0 && pathsWithI18n < totalPaths / 2) {
    findings.push({
      ruleId: 'I18N-COVERAGE',
      severity: 'info',
      message: `Only ${pathsWithI18n}/${totalPaths} endpoints have i18n support`,
      jsonPath: '$.paths',
      category: 'i18n'
    });
    score -= 1;
  }

  // Ensure score doesn't go below 0
  score = Math.max(0, score);

  return {
    findings,
    score: {
      i18n: {
        add: score,
        max: maxScore
      }
    }
  };
}
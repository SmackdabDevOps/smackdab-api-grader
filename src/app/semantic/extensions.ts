interface Finding {
  ruleId: string;
  severity: 'error' | 'warn' | 'info';
  message: string;
  jsonPath: string;
  category: string;
}

interface ExtensionsCheckResult {
  findings: Finding[];
  score: {
    extensions: {
      add: number;
      max: number;
    };
  };
}

export function checkExtensions(spec: any): ExtensionsCheckResult {
  const findings: Finding[] = [];
  let score = 15; // Start with max score
  const maxScore = 15;

  // Handle edge cases
  if (!spec) {
    return {
      findings: [],
      score: { extensions: { add: 12, max: maxScore } }
    };
  }

  // Track extension patterns found
  let hasVendorExtensions = false;
  let hasSmackdabExtensions = false;
  let hasDeprecationExtensions = false;
  let hasExampleExtensions = false;
  let extensionCount = 0;
  const foundExtensions = new Set<string>();

  // Track visited objects to prevent circular reference issues
  const visited = new WeakSet();
  
  // Recursively check for x- extensions
  function checkForExtensions(obj: any, path: string = '$') {
    if (!obj || typeof obj !== 'object') return;
    
    // Handle circular references
    if (visited.has(obj)) return;
    visited.add(obj);

    for (const [key, value] of Object.entries(obj)) {
      if (key.startsWith('x-')) {
        extensionCount++;
        foundExtensions.add(key);
        hasVendorExtensions = true;

        // Check for specific extension types
        if (key === 'x-smackdab' || key.startsWith('x-smackdab-')) {
          hasSmackdabExtensions = true;
        }
        if (key === 'x-deprecated' || key === 'x-deprecation-date') {
          hasDeprecationExtensions = true;
        }
        if (key === 'x-example' || key === 'x-examples') {
          hasExampleExtensions = true;
        }
      }

      // Recurse into nested objects
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        checkForExtensions(value, `${path}.${key}`);
      } else if (Array.isArray(value)) {
        value.forEach((item, index) => {
          if (item && typeof item === 'object') {
            checkForExtensions(item, `${path}.${key}[${index}]`);
          }
        });
      }
    }
  }

  // Check entire spec for extensions
  checkForExtensions(spec);

  // Check paths specifically
  if (spec.paths) {
    for (const [path, pathItem] of Object.entries(spec.paths)) {
      if (!pathItem || typeof pathItem !== 'object') continue;

      // Check for path-level extensions
      for (const key of Object.keys(pathItem as any)) {
        if (key.startsWith('x-')) {
          hasVendorExtensions = true;
        }
      }
    }
  }

  // Apply scoring based on findings
  if (!hasVendorExtensions) {
    // No extensions is fine, slight deduction
    findings.push({
      ruleId: 'EXT-NONE',
      severity: 'info',
      message: 'No vendor extensions found',
      jsonPath: '$',
      category: 'extensions'
    });
    score = 12; // Default score for no extensions
  } else {
    // Extensions present, check quality
    if (hasSmackdabExtensions) {
      // Bonus for Smackdab-specific extensions
      score = Math.min(15, score);
    } else {
      score = 14;
    }

    if (hasDeprecationExtensions) {
      // Good practice to have deprecation extensions
      findings.push({
        ruleId: 'EXT-DEPRECATION',
        severity: 'info',
        message: 'Deprecation extensions found (good practice)',
        jsonPath: '$',
        category: 'extensions'
      });
    }

    if (extensionCount > 50) {
      // Too many extensions
      findings.push({
        ruleId: 'EXT-EXCESSIVE',
        severity: 'warn',
        message: `Excessive use of extensions (${extensionCount} found)`,
        jsonPath: '$',
        category: 'extensions'
      });
      score -= 2;
    }

    // Check for unknown extensions
    const knownExtensions = ['x-smackdab', 'x-deprecated', 'x-example', 'x-internal', 'x-beta', 'x-stable'];
    const unknownExtensions = Array.from(foundExtensions).filter(ext => 
      !knownExtensions.some(known => ext.startsWith(known))
    );

    if (unknownExtensions.length > 10) {
      findings.push({
        ruleId: 'EXT-UNKNOWN',
        severity: 'info',
        message: `Many unknown vendor extensions: ${unknownExtensions.slice(0, 3).join(', ')}...`,
        jsonPath: '$',
        category: 'extensions'
      });
      score -= 1;
    }
  }

  // Ensure score doesn't go below 0
  score = Math.max(0, Math.min(maxScore, score));

  return {
    findings,
    score: {
      extensions: {
        add: score,
        max: maxScore
      }
    }
  };
}
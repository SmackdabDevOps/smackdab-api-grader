interface Finding {
  ruleId: string;
  severity: 'error' | 'warn' | 'info';
  message: string;
  jsonPath: string;
  category: string;
}

interface WebhooksCheckResult {
  findings: Finding[];
  score: {
    webhooks: {
      add: number;
      max: number;
    };
  };
}

export function checkWebhooks(spec: any): WebhooksCheckResult {
  const findings: Finding[] = [];
  let score = 6; // Start with max score
  const maxScore = 6;

  // Handle edge cases
  if (!spec || !spec.paths) {
    return {
      findings: [],
      score: { webhooks: { add: 6, max: maxScore } }
    };
  }

  // Track webhook patterns found
  let hasWebhookCallbacks = false;
  let hasWebhookSignatures = false;
  let hasWebhookRetry = false;
  let hasWebhookEvents = false;
  let webhookEndpoints = 0;

  // Check for webhooks in callbacks (OpenAPI 3.0 feature)
  for (const [path, pathItem] of Object.entries(spec.paths || {})) {
    if (!pathItem || typeof pathItem !== 'object') continue;

    for (const [method, operation] of Object.entries(pathItem as any)) {
      if (!operation || typeof operation !== 'object') continue;
      if (['parameters', 'servers', 'summary', 'description'].includes(method)) continue;

      const op = operation as any;

      // Check for callbacks (webhook definitions)
      if (op.callbacks) {
        hasWebhookCallbacks = true;
        webhookEndpoints++;

        // Check callback details
        for (const [callbackName, callback] of Object.entries(op.callbacks)) {
          if (!callback || typeof callback !== 'object') continue;

          for (const [expression, expressionItem] of Object.entries(callback as any)) {
            if (!expressionItem || typeof expressionItem !== 'object') continue;

            for (const [callbackMethod, callbackOp] of Object.entries(expressionItem as any)) {
              if (!callbackOp || typeof callbackOp !== 'object') continue;
              const cbOp = callbackOp as any;

              // Check for webhook signature headers
              if (cbOp.parameters) {
                const hasSignature = cbOp.parameters.some((param: any) =>
                  param.in === 'header' && 
                  (param.name === 'X-Webhook-Signature' || 
                   param.name === 'X-Hub-Signature' ||
                   param.name === 'X-Signature')
                );
                if (hasSignature) {
                  hasWebhookSignatures = true;
                }
              }

              // Check for webhook event type headers
              if (cbOp.parameters) {
                const hasEventType = cbOp.parameters.some((param: any) =>
                  param.in === 'header' && 
                  (param.name === 'X-Event-Type' || 
                   param.name === 'X-Webhook-Event' ||
                   param.name === 'X-GitHub-Event')
                );
                if (hasEventType) {
                  hasWebhookEvents = true;
                }
              }
            }
          }
        }
      }

      // Check for webhook-related endpoints (registration, management)
      if (path.includes('/webhook') || path.includes('/hook') || path.includes('/callback')) {
        webhookEndpoints++;

        // Check for retry mechanism indicators
        const responses = op.responses || {};
        if (responses['202'] || responses['503']) {
          hasWebhookRetry = true;
        }
      }
    }
  }

  // Apply scoring based on findings
  if (!hasWebhookCallbacks && webhookEndpoints === 0) {
    findings.push({
      ruleId: 'WEBHOOK-MISSING',
      severity: 'info',
      message: 'No webhook support detected',
      jsonPath: '$.paths',
      category: 'webhooks'
    });
    score = 6; // No webhooks is okay, return full score
  } else {
    // If webhooks are present, check quality
    if (hasWebhookCallbacks && !hasWebhookSignatures) {
      findings.push({
        ruleId: 'WEBHOOK-NO-SIGNATURE',
        severity: 'error',
        message: 'Webhook callbacks lack signature validation',
        jsonPath: '$.paths',
        category: 'webhooks'
      });
      score -= 3;
    }

    if (hasWebhookCallbacks && !hasWebhookEvents) {
      findings.push({
        ruleId: 'WEBHOOK-NO-EVENTS',
        severity: 'warn',
        message: 'Webhook callbacks lack event type headers',
        jsonPath: '$.paths',
        category: 'webhooks'
      });
      score -= 1;
    }

    if (webhookEndpoints > 0 && !hasWebhookRetry) {
      findings.push({
        ruleId: 'WEBHOOK-NO-RETRY',
        severity: 'info',
        message: 'No webhook retry mechanism detected',
        jsonPath: '$.paths',
        category: 'webhooks'
      });
      score -= 1;
    }
  }

  // Ensure score doesn't go below 0
  score = Math.max(0, score);

  return {
    findings,
    score: {
      webhooks: {
        add: score,
        max: maxScore
      }
    }
  };
}
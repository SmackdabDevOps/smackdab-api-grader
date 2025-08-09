#!/usr/bin/env node

import fs from 'fs/promises';
import yaml from 'yaml';
import path from 'path';

// Your 50 checkpoints
const CHECKPOINTS = [
  // Category 1: OpenAPI Compliance (10 points)
  { id: 'OAS-VERSION', category: 'openapi', description: 'OpenAPI version must be 3.0.3', weight: 2, autoFail: true },
  { id: 'OAS-OPERATIONIDS', category: 'openapi', description: 'All operationIds globally unique', weight: 2 },
  { id: 'OAS-NO-PLACEHOLDERS', category: 'openapi', description: 'No {domain}/{Resource} placeholders', weight: 2 },
  { id: 'OAS-VALID-SCHEMA', category: 'openapi', description: 'Passes OpenAPI schema validation', weight: 2 },
  { id: 'OAS-X-WEBHOOKS', category: 'openapi', description: 'Uses x-webhooks not webhooks for 3.0.3', weight: 2 },

  // Category 2: Security & Authentication (10 points)
  { id: 'SEC-OAUTH2-SCOPES', category: 'security', description: 'Concrete OAuth2 scopes (read:{domain}, write:{domain})', weight: 2 },
  { id: 'SEC-PER-OP-SECURITY', category: 'security', description: 'GET has read scope, POST/PATCH/DELETE have write scope', weight: 2 },
  { id: 'SEC-BEARER-JWT', category: 'security', description: 'Bearer JWT auth method supported', weight: 2 },
  { id: 'SEC-APIKEY-RESTRICT', category: 'security', description: 'ApiKey used ONLY for webhooks/service-to-service', weight: 2 },
  { id: 'SEC-WWW-AUTH', category: 'security', description: 'WWW-Authenticate on 401 responses', weight: 2 },

  // Category 3: Multi-Tenancy & Headers (10 points)
  { id: 'MT-ORG-HDR', category: 'tenancy', description: 'X-Organization-ID on ALL operations', weight: 2, autoFail: true },
  { id: 'MT-BIGINT-UUID', category: 'tenancy', description: 'BIGINT/UUID dual format support', weight: 2 },
  { id: 'MT-BRANCH-HDR', category: 'tenancy', description: 'X-Branch-ID where applicable', weight: 2 },
  { id: 'MT-REQUEST-ID', category: 'tenancy', description: 'X-Request-ID on ALL responses', weight: 2 },
  { id: 'MT-W3C-TRACE', category: 'tenancy', description: 'W3C trace headers supported', weight: 2 },

  // Category 4: HTTP Semantics (10 points)
  { id: 'HTTP-STATUS-CODES', category: 'http', description: 'All required status codes present', weight: 2 },
  { id: 'HTTP-428-PATCH-DELETE', category: 'http', description: '428 on PATCH/DELETE when If-Match required', weight: 2 },
  { id: 'HTTP-415-POST-PATCH', category: 'http', description: '415 on POST/PATCH for content-type validation', weight: 2 },
  { id: 'HTTP-503-GET', category: 'http', description: '503 on GET for service unavailability', weight: 2 },
  { id: 'HTTP-409-VS-422', category: 'http', description: '409 vs 422 properly distinguished', weight: 2 },

  // Category 5: Rate Limiting & Caching (10 points)
  { id: 'RATE-LIMIT-SUCCESS', category: 'ratelimit', description: 'X-RateLimit-* on 200,201,202,204,206', weight: 2 },
  { id: 'CACHE-ETAG-GET', category: 'caching', description: 'ETag on GET 200 responses', weight: 2 },
  { id: 'CACHE-CONDITIONAL', category: 'caching', description: 'If-Match/If-None-Match support', weight: 2 },
  { id: 'CACHE-304', category: 'caching', description: '304 Not Modified support', weight: 2 },
  { id: 'CACHE-VARY', category: 'caching', description: 'Vary header on cacheable responses', weight: 2 },

  // Category 6: Response Structure (10 points)
  { id: 'RESP-ENVELOPE', category: 'envelope', description: 'ResponseEnvelope with success, data, meta, _links', weight: 2 },
  { id: 'RESP-META-SCHEMA', category: 'envelope', description: 'ResponseMeta uses $ref not inline', weight: 2 },
  { id: 'RESP-HATEOAS', category: 'envelope', description: 'HATEOAS links as objects with href and method', weight: 2 },
  { id: 'RESP-RFC7807', category: 'envelope', description: 'RFC 7807 ProblemDetail for ALL errors', weight: 2 },
  { id: 'RESP-CONSISTENCY', category: 'envelope', description: 'Same structure across all operations', weight: 2 },

  // Category 7: Pagination & Filtering (10 points)
  { id: 'PAG-KEYSET', category: 'pagination', description: 'Key-set pagination (after_key/before_key)', weight: 2, autoFail: true },
  { id: 'PAG-TIE-BREAKER', category: 'pagination', description: 'Tie-breaker rules documented', weight: 2 },
  { id: 'PAG-FILTER', category: 'pagination', description: 'Filter parameter deepObject style', weight: 2 },
  { id: 'PAG-SPARSE-FIELDS', category: 'pagination', description: 'Fields parameter for sparse fieldsets', weight: 2 },
  { id: 'PAG-INCLUDE', category: 'pagination', description: 'Include/expand for related resources', weight: 2 },

  // Category 8: Async & Idempotency (10 points)
  { id: 'ASYNC-202', category: 'async', description: '202 Accepted with rate-limit headers', weight: 2 },
  { id: 'ASYNC-JOB-STATUS', category: 'async', description: 'Job status endpoint /api/v2/{domain}/jobs/{job_id}', weight: 2 },
  { id: 'ASYNC-JOB-SCHEMA', category: 'async', description: 'AsyncJobStatus schema with proper states', weight: 2 },
  { id: 'ASYNC-IDEMPOTENCY', category: 'async', description: 'X-Idempotency-Key on POST/PATCH', weight: 2 },
  { id: 'ASYNC-SEMANTICS', category: 'async', description: 'Idempotency scope, TTL, replay documented', weight: 2 },

  // Category 9: Content & Webhooks (10 points)
  { id: 'CONTENT-PATCH-TYPES', category: 'content', description: 'PATCH supports application/json and merge-patch+json', weight: 2 },
  { id: 'WEBHOOK-X-WEBHOOKS', category: 'webhooks', description: 'Uses x-webhooks not webhooks (3.0.3)', weight: 2 },
  { id: 'WEBHOOK-HMAC', category: 'webhooks', description: 'HMAC-SHA256 webhook verification', weight: 2 },
  { id: 'WEBHOOK-SECURITY', category: 'webhooks', description: 'Webhook ApiKeyAuth, timestamp, signature', weight: 2 },
  { id: 'CONTENT-ACCEPT-LANG', category: 'content', description: 'Accept-Language header support', weight: 2 },

  // Category 10: Documentation & Compliance (10 points)
  { id: 'DOC-BUSINESS-RULES', category: 'docs', description: 'Business rules in RULE-XXX-001 format', weight: 2 },
  { id: 'DOC-PERF-SLAS', category: 'docs', description: 'Performance SLAs documented (<100ms p95 read)', weight: 2 },
  { id: 'DOC-TECH-STACK', category: 'docs', description: 'Smackdab tech stack correct (Citus, Dragonfly, Pulsar)', weight: 2 },
  { id: 'DOC-GLOBAL-ERRORS', category: 'docs', description: 'Global errors documented', weight: 2 },
  { id: 'DOC-API-VERSION', category: 'docs', description: 'API versioning /api/v2/{domain}/{resources}', weight: 2 },
];

function gradeSpec(spec) {
  const findings = [];
  let score = 0;
  const autoFails = [];

  // Quick and dirty checks - you can improve these as needed
  
  // Check OpenAPI version
  if (spec.openapi !== '3.0.3') {
    findings.push({ checkpoint: 'OAS-VERSION', passed: false, message: `Wrong version: ${spec.openapi}` });
    autoFails.push('OpenAPI version must be 3.0.3');
  } else {
    findings.push({ checkpoint: 'OAS-VERSION', passed: true });
    score += 2;
  }

  // Check for X-Organization-ID in all operations
  let hasAllOrgHeaders = true;
  if (spec.paths) {
    for (const [path, pathItem] of Object.entries(spec.paths)) {
      for (const [method, operation] of Object.entries(pathItem)) {
        if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
          const params = operation.parameters || [];
          const hasOrgHeader = params.some(p => 
            p.name === 'X-Organization-ID' || 
            p.$ref === '#/components/parameters/OrganizationHeader'
          );
          if (!hasOrgHeader) {
            hasAllOrgHeaders = false;
            findings.push({ 
              checkpoint: 'MT-ORG-HDR', 
              passed: false, 
              message: `Missing X-Organization-ID on ${method.toUpperCase()} ${path}` 
            });
          }
        }
      }
    }
  }
  
  if (hasAllOrgHeaders) {
    findings.push({ checkpoint: 'MT-ORG-HDR', passed: true });
    score += 2;
  } else {
    autoFails.push('X-Organization-ID missing on some operations');
  }

  // Check for key-set pagination
  let hasKeySetPagination = false;
  if (spec.components?.parameters) {
    for (const [name, param] of Object.entries(spec.components.parameters)) {
      if (param.name === 'after_key' || param.name === 'before_key') {
        hasKeySetPagination = true;
      }
      if (param.name === 'offset' || param.name === 'page' || param.name === 'cursor') {
        findings.push({ 
          checkpoint: 'PAG-KEYSET', 
          passed: false, 
          message: `Found forbidden pagination param: ${param.name}` 
        });
        autoFails.push('Must use key-set pagination, not offset/cursor');
      }
    }
  }

  if (hasKeySetPagination && !autoFails.some(f => f.includes('pagination'))) {
    findings.push({ checkpoint: 'PAG-KEYSET', passed: true });
    score += 2;
  }

  // Add more checks as needed...
  // For now, let's just pass the remaining with warnings
  CHECKPOINTS.forEach(checkpoint => {
    if (!findings.some(f => f.checkpoint === checkpoint.id)) {
      findings.push({ 
        checkpoint: checkpoint.id, 
        passed: false, 
        message: 'Not implemented in quick grader' 
      });
    }
  });

  // Calculate final score
  const letterGrade = score >= 97 ? 'A+' :
                      score >= 93 ? 'A' :
                      score >= 90 ? 'A-' :
                      score >= 87 ? 'B+' :
                      score >= 83 ? 'B' :
                      score >= 80 ? 'B-' :
                      score >= 70 ? 'C' :
                      score >= 60 ? 'D' : 'F';

  // Auto-fail reduces score to max 59
  if (autoFails.length > 0) {
    score = Math.min(score, 59);
  }

  return { score, letterGrade, findings, autoFails };
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node simple-grader.js <api-spec.yaml>');
    process.exit(1);
  }

  const specPath = args[0];
  
  try {
    const content = await fs.readFile(specPath, 'utf8');
    const spec = yaml.parse(content);
    
    console.log(`\n📊 Grading: ${specPath}\n${'='.repeat(60)}`);
    
    const result = gradeSpec(spec);
    
    console.log(`\n🎯 Score: ${result.score}/100 (${result.letterGrade})`);
    
    if (result.autoFails.length > 0) {
      console.log(`\n❌ AUTO-FAIL TRIGGERED:`);
      result.autoFails.forEach(fail => console.log(`  - ${fail}`));
    }
    
    console.log(`\n📋 Checkpoint Results:`);
    const categories = [...new Set(CHECKPOINTS.map(c => c.category))];
    
    categories.forEach(category => {
      const categoryCheckpoints = CHECKPOINTS.filter(c => c.category === category);
      const categoryFindings = result.findings.filter(f => 
        categoryCheckpoints.some(c => c.id === f.checkpoint)
      );
      
      const passed = categoryFindings.filter(f => f.passed).length;
      const total = categoryCheckpoints.length;
      
      console.log(`\n${category.toUpperCase()} (${passed}/${total}):`);
      categoryFindings.forEach(f => {
        const checkpoint = CHECKPOINTS.find(c => c.id === f.checkpoint);
        const icon = f.passed ? '✅' : '❌';
        console.log(`  ${icon} ${checkpoint.description}`);
        if (!f.passed && f.message) {
          console.log(`     └─ ${f.message}`);
        }
      });
    });
    
    // Save report
    const reportPath = specPath.replace('.yaml', '-grade-report.json');
    await fs.writeFile(reportPath, JSON.stringify(result, null, 2));
    console.log(`\n📄 Report saved to: ${reportPath}`);
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
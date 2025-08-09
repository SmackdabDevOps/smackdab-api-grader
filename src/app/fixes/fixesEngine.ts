import type { Severity } from '../checkpoints.js';
import crypto from 'node:crypto';

export type FixItem = {
  ruleId: string;
  severity: Severity;
  jsonPath: string;
  description: string;
  current?: string;
  suggested?: string;
  patch: {
    type: 'json-patch'|'unified-diff';
    preimageHash: string;
    body: string;
  };
  rationale?: string;
  risk?: 'low'|'medium'|'high';
};

function sha(s:string){ return crypto.createHash('sha256').update(s).digest('hex'); }

export function generateFixes(findings: Array<{ruleId:string; severity:Severity; jsonPath:string; message:string}>, specText: string): FixItem[] {
  const fixes: FixItem[] = [];
  const pre = sha(specText);

  for (const f of findings) {
    // Namespace fix
    if (f.ruleId === 'NAME-NAMESPACE') {
      fixes.push({
        ruleId: f.ruleId, severity: f.severity, jsonPath: '$.paths',
        description: 'Prefix all paths with /api/v2/{domain}',
        suggested: 'Rewrite paths to start with /api/v2/...',
        patch: {
          type: 'unified-diff',
          preimageHash: pre,
          body: `--- a/spec.yaml
+++ b/spec.yaml
@@
- /inventory/products:
+ /api/v2/inventory/products:
`
        },
        rationale: 'All endpoints must live under /api/v2 to match Smackdab versioning policy',
        risk: 'low'
      });
    }

    // Org header fix
    if (f.ruleId === 'SEC-ORG-HDR') {
      fixes.push({
        ruleId: f.ruleId, severity: f.severity, jsonPath: f.jsonPath,
        description: 'Add OrganizationHeader ref to operation parameters',
        suggested: `parameters:
  - $ref: '#/components/parameters/OrganizationHeader'`,
        patch: {
          type: 'json-patch',
          preimageHash: pre,
          body: JSON.stringify([
            { op: 'add', path: `${f.jsonPath || ''}/-`, value: { $ref: "#/components/parameters/OrganizationHeader" } }
          ])
        },
        rationale: 'Row-level tenant isolation requires org context on every request',
        risk: 'low'
      });
    }

    // Branch header fix
    if (f.ruleId === 'SEC-BRANCH-HDR') {
      fixes.push({
        ruleId: f.ruleId, severity: f.severity, jsonPath: f.jsonPath,
        description: 'Add BranchHeader ref to operation parameters',
        suggested: `parameters:
  - $ref: '#/components/parameters/BranchHeader'`,
        patch: {
          type: 'json-patch',
          preimageHash: pre,
          body: JSON.stringify([
            { op: 'add', path: `${f.jsonPath || ''}/-`, value: { $ref: "#/components/parameters/BranchHeader" } }
          ])
        },
        rationale: 'Branch context is required for multi-location isolation',
        risk: 'low'
      });
    }

    // Key-set pagination fix
    if (f.ruleId === 'PAG-KEYSET') {
      fixes.push({
        ruleId: f.ruleId, severity: f.severity, jsonPath: f.jsonPath,
        description: 'Add AfterKey, BeforeKey, Limit parameter refs to list endpoints',
        suggested: `parameters:
  - $ref: '#/components/parameters/AfterKey'
  - $ref: '#/components/parameters/BeforeKey'
  - $ref: '#/components/parameters/Limit'`,
        patch: {
          type: 'json-patch',
          preimageHash: pre,
          body: JSON.stringify([
            { op: 'add', path: `${f.jsonPath || ''}/-`, value: { $ref: "#/components/parameters/AfterKey" } },
            { op: 'add', path: `${f.jsonPath || ''}/-`, value: { $ref: "#/components/parameters/BeforeKey" } },
            { op: 'add', path: `${f.jsonPath || ''}/-`, value: { $ref: "#/components/parameters/Limit" } }
          ])
        },
        rationale: 'Key-set pagination ensures deterministic, cursor-based pagination (no offsets)',
        risk: 'low'
      });
    }

    // No-offset cleanup suggestion
    if (f.ruleId === 'PAG-NO-OFFSET') {
      fixes.push({
        ruleId: f.ruleId, severity: f.severity, jsonPath: f.jsonPath,
        description: 'Remove offset/page fields and migrate to key-set params',
        suggested: 'Delete offset/page/page_size/pageNumber parameters',
        patch: {
          type: 'unified-diff',
          preimageHash: pre,
          body: `--- a/spec.yaml
+++ b/spec.yaml
@@
-  - name: offset
-    in: query
-    schema: { type: integer }
-  - name: page
-    in: query
-    schema: { type: integer }
+  # replaced with key-set parameters (AfterKey/BeforeKey/Limit)
`
        },
        rationale: 'Offset pagination is disallowed per Smackdab standard',
        risk: 'low'
      });
    }
  }
  return fixes;
}

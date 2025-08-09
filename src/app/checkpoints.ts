export type Severity = 'error'|'warn'|'info';

export interface Checkpoint {
  id: string;
  category: string;
  description: string;
  weight: number;         // points toward 100
  autoFail?: boolean;     // triggers auto-fail if violated
}

export const CHECKPOINTS: Checkpoint[] = [
  // Naming / namespace
  { id: 'NAME-NAMESPACE', category: 'naming', description: 'All paths start with /api/v2/<domain>', weight: 4, autoFail: true },

  // Multi-tenancy
  { id: 'SEC-ORG-HDR', category: 'security', description: 'X-Organization-ID header present on all operations', weight: 4, autoFail: true },
  { id: 'SEC-BRANCH-HDR', category: 'security', description: 'X-Branch-ID header present on all operations', weight: 3 },

  // Security schemes present
  { id: 'SEC-OAUTH2', category: 'security', description: 'OAuth2 scheme present', weight: 2 },

  // Pagination
  { id: 'PAG-KEYSET', category: 'pagination', description: 'Key-set pagination (AfterKey/BeforeKey/Limit)', weight: 5, autoFail: true },
  { id: 'PAG-NO-OFFSET', category: 'pagination', description: 'No offset/page/page_size/pageNumber', weight: 3, autoFail: true },

  // HTTP semantics (placeholders for now)
  { id: 'HTTP-ETAG', category: 'http', description: 'ETag on cacheable responses', weight: 2 },
  { id: 'HTTP-304', category: 'http', description: '304 for conditional GET', weight: 2 },

  // Error format
  { id: 'ERR-PROBLEMJSON', category: 'responses', description: 'application/problem+json errors', weight: 3 },

  // Envelope
  { id: 'ENV-RESPONSE', category: 'envelope', description: 'ResponseEnvelope on all 2xx', weight: 4 },
];

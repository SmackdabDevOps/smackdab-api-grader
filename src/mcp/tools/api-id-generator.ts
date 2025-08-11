import crypto from 'node:crypto';

export interface ApiIdMetadata {
  organization?: string;
  domain?: string;
  type?: string;
}

/**
 * Generate a unique, persistent API identifier
 * Format: {prefix}_{timestamp}_{random}
 * Example: acme_1736180423567_a3f8b2c9d4e5f6a7
 */
export function generateApiId(metadata?: ApiIdMetadata): string {
  const prefix = metadata?.organization || 'api';
  const timestamp = Date.now();
  const random = crypto.randomBytes(8).toString('hex');
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * Validate API ID format
 * Must match pattern: {prefix}_{13-digit-timestamp}_{16-hex-chars}
 */
export function validateApiIdFormat(apiId: string): boolean {
  const validFormat = /^[a-z0-9]+_\d{13}_[a-f0-9]{16}$/;
  return validFormat.test(apiId);
}

/**
 * Extract metadata from an API ID
 */
export function extractApiIdMetadata(apiId: string): {
  organization: string;
  timestamp: number;
  randomPart: string;
  createdAt: Date;
} | null {
  const parts = apiId.split('_');
  if (parts.length !== 3) return null;
  
  const [organization, timestampStr, randomPart] = parts;
  const timestamp = parseInt(timestampStr, 10);
  
  if (isNaN(timestamp)) return null;
  
  return {
    organization,
    timestamp,
    randomPart,
    createdAt: new Date(timestamp)
  };
}

/**
 * Generate instructions for adding API ID to OpenAPI spec
 */
export function getApiIdInstructions(apiId: string): string {
  return `
API ID Generated: ${apiId}

To use this ID, add it to your OpenAPI specification's info section:

\`\`\`yaml
openapi: 3.0.3
info:
  title: Your API Title
  version: 1.0.0
  x-api-id: ${apiId}  # Add this line
  x-api-created: "${new Date().toISOString()}"  # Optional: track creation date
\`\`\`

This ID will be used to track your API across all versions and improvements.
The ID should remain the same even when you update the version number.
`;
}

/**
 * Generate API ID with lineage tracking
 */
export function generateApiIdWithLineage(
  parentId: string | undefined,
  metadata?: ApiIdMetadata & { forkReason?: string }
): {
  apiId: string;
  lineage?: {
    parentId: string;
    forkReason?: string;
  };
} {
  const apiId = generateApiId(metadata);
  
  if (parentId) {
    return {
      apiId,
      lineage: {
        parentId,
        forkReason: metadata?.forkReason
      }
    };
  }
  
  return { apiId };
}
// Minimal structural validation w/ hard 3.0.3 check. 
// You can replace with Redocly or Swagger-Parser later; this enforces the non-negotiable now.

export type OASValidation = { errors: { message: string; path?: string }[], warnings: { message: string; path?: string }[] };

export async function validateOpenAPI(spec: any): Promise<OASValidation> {
  const errors: OASValidation['errors'] = [];
  const warnings: OASValidation['warnings'] = [];

  // Enforce OpenAPI 3.0.3 only
  const version = spec?.openapi;
  if (version !== '3.0.3') {
    errors.push({ message: `OpenAPI version must be 3.0.3 (found: ${version ?? 'missing'})`, path: '$.openapi' });
  }

  // Basic presence checks
  if (!spec?.info?.title) errors.push({ message: 'Missing info.title', path: '$.info.title' });
  if (!spec?.paths || typeof spec.paths !== 'object') errors.push({ message: 'Missing or invalid paths', path: '$.paths' });
  if (!spec?.components?.schemas) warnings.push({ message: 'components.schemas missing (not fatal)', path: '$.components.schemas' });

  return { errors, warnings };
}

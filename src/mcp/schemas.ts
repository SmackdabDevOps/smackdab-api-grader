import { z } from 'zod';

export const VersionResult = z.object({
  serverVersion: z.string(),
  rulesetHash: z.string(),
  templateVersion: z.string(),
  templateHash: z.string(),
  toolVersions: z.object({
    spectral: z.string().optional(),
    redocly: z.string().optional(),
    ajv: z.string().optional(),
    grader: z.string().optional()
  })
});

export const GradeContractArgs = z.object({
  path: z.string(),
  templatePath: z.string().optional(),
  strict: z.boolean().optional(),
  failThreshold: z.number().optional(),
  return: z.enum(['summary','full']).optional()
});

export const GradeInlineArgs = z.object({
  content: z.string(),
  uri: z.string().optional(),
  templatePath: z.string().optional(),
  strict: z.boolean().optional()
});

export const RegisterOrIdentifyArgs = z.object({
  path: z.string().optional(),
  content: z.string().optional(),
  uri: z.string().optional(),
  proposedApiId: z.string().optional()
});

export const GradeAndRecordArgs = z.object({
  path: z.string().optional(),
  content: z.string().optional(),
  uri: z.string().optional(),
  persist: z.boolean().optional().default(true)
});

export const GetApiHistoryArgs = z.object({
  apiId: z.string(),
  limit: z.number().optional(),
  since: z.string().optional()
});

export const CompareRunsArgs = z.object({
  baselineRunId: z.string(),
  candidateRunId: z.string()
});

export const ExplainFindingArgs = z.object({
  ruleId: z.string(),
  jsonPath: z.string().optional()
});

export const SuggestFixesArgs = z.object({
  path: z.string().optional(),
  content: z.string().optional(),
  issueLimit: z.number().optional().default(10)
});

export const ApplyFixesArgs = z.object({
  path: z.string(),
  fixes: z.array(z.object({
    ruleId: z.string(),
    severity: z.enum(['error','warn','info']),
    jsonPath: z.string(),
    description: z.string().optional(),
    current: z.string().optional(),
    suggested: z.string().optional(),
    patch: z.object({
      type: z.enum(['json-patch','unified-diff']),
      preimageHash: z.string(),
      body: z.string()
    }),
    rationale: z.string().optional(),
    risk: z.enum(['low','medium','high']).optional()
  })),
  dryRun: z.boolean().optional().default(true),
  backup: z.boolean().optional().default(true)
});

export type Severity = 'error'|'warn'|'info';


export const TopViolationsArgs = z.object({
  limit: z.number().optional()
});

export const CompareRunsArgs2 = CompareRunsArgs;

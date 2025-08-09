export type CategoryKey = 'security'|'http'|'caching'|'pagination'|'envelope'|'async'|'webhooks'|'i18n'|'naming'|'extensions';

export interface CheckpointScore {
  checkpointId: string;
  category: CategoryKey;
  maxPoints: number;
  scoredPoints: number;
}

export const WEIGHTS: Record<CategoryKey, number> = {
  security: 15, http: 12, caching: 10, pagination: 8, envelope: 10, async: 8, webhooks: 6, i18n: 6, naming: 10, extensions: 15
};

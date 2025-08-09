import type { RulesetDefinition } from '@stoplight/spectral-core';

export type SpectralFinding = { code: string; message: string; path: string[]; severity: number };

export async function runSpectral(spec: any, spectralYaml?: string): Promise<{ findings: SpectralFinding[] }> {
  try {
    const { Spectral, Document, parsers } = await import('@stoplight/spectral-core');
    const { Yaml } = await import('@stoplight/spectral-parsers');
    const spectral = new Spectral();

    if (spectralYaml) {
      // Minimal YAML→ruleset handling: load as a generic YAML doc; users can place full rules under top-level keys.
      // For robust use, plug in @stoplight/spectral-ruleset-migrator or custom loader.
      const rsDoc = new Yaml.Document(spectralYaml);
      const raw = rsDoc.toJS() as RulesetDefinition;
      await spectral.setRuleset(raw || {});
    } else {
      await spectral.setRuleset({} as RulesetDefinition);
    }

    const doc = new Document(JSON.stringify(spec), parsers.Json);
    const results = await spectral.run(doc);
    return { findings: results.map(r => ({ code: (r.code as string) || 'SPECTRAL', message: r.message, path: r.path as string[], severity: r.severity ?? 1 })) };
  } catch {
    return { findings: [] };
  }
}

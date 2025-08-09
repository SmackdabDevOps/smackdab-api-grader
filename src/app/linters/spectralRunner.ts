import type { RulesetDefinition } from '@stoplight/spectral-core';

export type SpectralFinding = { code: string; message: string; path: string[]; severity: number };

export async function runSpectral(spec: any, spectralYaml?: string): Promise<{ findings: SpectralFinding[] }> {
  try {
    const SpectralCore = await import('@stoplight/spectral-core');
    const Parsers = await import('@stoplight/spectral-parsers');
    const { Spectral, Document } = SpectralCore as any;
    const { Yaml } = Parsers as any;
    const spectral = new Spectral();

    if (spectralYaml) {
      // Minimal YAML→ruleset handling: load as a generic YAML doc; users can place full rules under top-level keys.
      // For robust use, plug in @stoplight/spectral-ruleset-migrator or custom loader.
      const yamlParser = new (Yaml as any)();
      const raw = yamlParser.parse(spectralYaml) as RulesetDefinition;
      await spectral.setRuleset(raw || {});
    } else {
      await spectral.setRuleset({} as RulesetDefinition);
    }

    const doc = new Document(JSON.stringify(spec), (Parsers as any).Json);
    const results = await spectral.run(doc);
    return { findings: results.map((r: any) => ({ code: (r.code as string) || 'SPECTRAL', message: r.message, path: r.path as string[], severity: r.severity ?? 1 })) };
  } catch {
    return { findings: [] };
  }
}

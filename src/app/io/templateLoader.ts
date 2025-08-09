import fs from 'node:fs/promises';
import { parseDocument } from 'yaml';

export async function loadTemplate(path: string): Promise<{ templateHash: string; rulesetHash: string; spectralYaml?: string }> {
  const raw = await fs.readFile(path, 'utf8');
  const doc = parseDocument(raw);
  const xSpectral = doc.getIn(['x-spectral']);
  // We simply re-serialize the x-spectral node back to YAML to feed Spectral loader.
  const spectralYaml = xSpectral ? doc.createNode(xSpectral).toString() : undefined;

  // quick hashes to track provenance (very light impl)
  const crypto = await import('node:crypto');
  const h = (s:string)=> crypto.createHash('sha256').update(s).digest('hex');
  const templateHash = h(raw);
  const rulesetHash = spectralYaml ? h(spectralYaml) : 'none';
  return { templateHash, rulesetHash, spectralYaml };
}

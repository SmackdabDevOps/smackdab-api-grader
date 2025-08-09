import fs from 'node:fs/promises';
import { parseDocument } from 'yaml';

export interface ParsedDoc {
  ast: any;
  raw: string;
  // TODO: implement jsonPath -> line mapping
  lineMap?: Map<string, number>;
}

export async function loadYaml(path: string): Promise<ParsedDoc> {
  const raw = await fs.readFile(path, 'utf8');
  const doc = parseDocument(raw, { keepCstNodes: true, keepNodeTypes: true });
  return { ast: doc.toJS(), raw };
}

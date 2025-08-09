import crypto from 'node:crypto';
import stringify from 'fast-json-stable-stringify';

export function sha256(input: string | Buffer) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function canonicalJson(obj: any) {
  return stringify(obj);
}

export interface Patch {
  type: 'json-patch'|'unified-diff';
  preimageHash: string;
  body: string;
}

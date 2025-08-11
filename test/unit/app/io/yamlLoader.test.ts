import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs/promises';
import { parseDocument } from 'yaml';
import { loadYaml, ParsedDoc } from '../../../../src/app/io/yamlLoader';

// Mock fs module
jest.mock('node:fs/promises', () => ({
  readFile: jest.fn()
}));

// Mock yaml module
jest.mock('yaml', () => ({
  parseDocument: jest.fn()
}));

const mockFs = fs as jest.Mocked<typeof fs>;
const mockParseDocument = parseDocument as jest.MockedFunction<typeof parseDocument>;

describe('yamlLoader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('loadYaml', () => {
    const mockYamlContent = `
openapi: 3.0.3
info:
  title: Test API
  version: 1.0.0
paths:
  /products:
    get:
      responses:
        '200':
          description: Success
    `;

    const mockParsedObject = {
      openapi: '3.0.3',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {
        '/products': {
          get: {
            responses: {
              '200': {
                description: 'Success'
              }
            }
          }
        }
      }
    };

    beforeEach(() => {
      // Setup default mock behavior
      mockFs.readFile.mockResolvedValue(mockYamlContent);
      
      const mockDocument = {
        toJS: jest.fn().mockReturnValue(mockParsedObject)
      };
      mockParseDocument.mockReturnValue(mockDocument as any);
    });

    it('should read file with correct path and encoding', async () => {
      await loadYaml('/test/path/spec.yaml');
      
      expect(mockFs.readFile).toHaveBeenCalledWith('/test/path/spec.yaml', 'utf8');
    });

    it('should parse YAML document with correct options', async () => {
      await loadYaml('/test/path/spec.yaml');
      
      expect(mockParseDocument).toHaveBeenCalledWith(mockYamlContent, expect.objectContaining({ keepNodeTypes: true }));
    });

    it('should return ParsedDoc with correct structure', async () => {
      const result = await loadYaml('/test/path/spec.yaml');
      
      expect(result).toBeDefined();
      expect(result).toHaveProperty('ast');
      expect(result).toHaveProperty('raw');
      
      expect(result.ast).toEqual(mockParsedObject);
      expect(result.raw).toBe(mockYamlContent);
      expect(result.lineMap).toBeUndefined(); // TODO comment indicates not implemented
    });

    it('should handle simple YAML files', async () => {
      const simpleYaml = 'key: value\nanother: test';
      const simpleObject = { key: 'value', another: 'test' };
      
      mockFs.readFile.mockResolvedValue(simpleYaml);
      const mockDocument = {
        toJS: jest.fn().mockReturnValue(simpleObject)
      };
      mockParseDocument.mockReturnValue(mockDocument as any);
      
      const result = await loadYaml('/test/simple.yaml');
      
      expect(result.ast).toEqual(simpleObject);
      expect(result.raw).toBe(simpleYaml);
    });

    it('should handle complex nested YAML structures', async () => {
      const complexYaml = `
nested:
  deep:
    structure:
      - item1
      - item2
      - nested_object:
          key: value
arrays:
  - one
  - two
  - three
`;
      const complexObject = {
        nested: {
          deep: {
            structure: [
              'item1',
              'item2',
              { nested_object: { key: 'value' } }
            ]
          }
        },
        arrays: ['one', 'two', 'three']
      };
      
      mockFs.readFile.mockResolvedValue(complexYaml);
      const mockDocument = {
        toJS: jest.fn().mockReturnValue(complexObject)
      };
      mockParseDocument.mockReturnValue(mockDocument as any);
      
      const result = await loadYaml('/test/complex.yaml');
      
      expect(result.ast).toEqual(complexObject);
      expect(result.raw).toBe(complexYaml);
    });

    it('should handle empty YAML files', async () => {
      const emptyYaml = '';
      
      mockFs.readFile.mockResolvedValue(emptyYaml);
      const mockDocument = {
        toJS: jest.fn().mockReturnValue(null)
      };
      mockParseDocument.mockReturnValue(mockDocument as any);
      
      const result = await loadYaml('/test/empty.yaml');
      
      expect(result.ast).toBeNull();
      expect(result.raw).toBe(emptyYaml);
    });

    it('should handle YAML files with only whitespace', async () => {
      const whitespaceYaml = '   \n  \t  \n   ';
      
      mockFs.readFile.mockResolvedValue(whitespaceYaml);
      const mockDocument = {
        toJS: jest.fn().mockReturnValue(null)
      };
      mockParseDocument.mockReturnValue(mockDocument as any);
      
      const result = await loadYaml('/test/whitespace.yaml');
      
      expect(result.ast).toBeNull();
      expect(result.raw).toBe(whitespaceYaml);
    });

    it('should handle YAML with comments', async () => {
      const yamlWithComments = `
# This is a comment
openapi: 3.0.3  # Version comment
info:
  title: Test API  # Title comment
  # Nested comment
  version: 1.0.0
# End comment
`;
      const parsedWithComments = {
        openapi: '3.0.3',
        info: {
          title: 'Test API',
          version: '1.0.0'
        }
      };
      
      mockFs.readFile.mockResolvedValue(yamlWithComments);
      const mockDocument = {
        toJS: jest.fn().mockReturnValue(parsedWithComments)
      };
      mockParseDocument.mockReturnValue(mockDocument as any);
      
      const result = await loadYaml('/test/comments.yaml');
      
      expect(result.ast).toEqual(parsedWithComments);
      expect(result.raw).toBe(yamlWithComments);
    });

    it('should handle YAML with special characters and escaping', async () => {
      const specialYaml = `
special_chars: "quotes and \\n newlines"
unicode: "🚀 rocket"
multiline: |
  This is a
  multiline string
  with multiple lines
folded: >
  This is a folded
  string that becomes
  a single line
`;
      const specialObject = {
        special_chars: 'quotes and \n newlines',
        unicode: '🚀 rocket',
        multiline: 'This is a\nmultiline string\nwith multiple lines\n',
        folded: 'This is a folded string that becomes a single line\n'
      };
      
      mockFs.readFile.mockResolvedValue(specialYaml);
      const mockDocument = {
        toJS: jest.fn().mockReturnValue(specialObject)
      };
      mockParseDocument.mockReturnValue(mockDocument as any);
      
      const result = await loadYaml('/test/special.yaml');
      
      expect(result.ast).toEqual(specialObject);
      expect(result.raw).toBe(specialYaml);
    });

    it('should handle different file extensions', async () => {
      const paths = [
        '/test/file.yaml',
        '/test/file.yml',
        '/test/file.YAML',
        '/test/file.YML',
        '/test/openapi.yaml',
        '/test/spec.yml'
      ];
      
      for (const path of paths) {
        mockFs.readFile.mockClear();
        await loadYaml(path);
        expect(mockFs.readFile).toHaveBeenCalledWith(path, 'utf8');
      }
    });

    it('should handle files with no extension', async () => {
      await loadYaml('/test/spec');
      
      expect(mockFs.readFile).toHaveBeenCalledWith('/test/spec', 'utf8');
    });

    it('should preserve original raw content exactly', async () => {
      const rawWithSpecialFormatting = `openapi:   3.0.3\ninfo:\n    title:    Test API\n  version:  1.0.0`;
      
      mockFs.readFile.mockResolvedValue(rawWithSpecialFormatting);
      
      const result = await loadYaml('/test/formatted.yaml');
      
      expect(result.raw).toBe(rawWithSpecialFormatting);
    });

    describe('error handling', () => {
      it('should propagate file reading errors', async () => {
        const fileError = new Error('File not found');
        mockFs.readFile.mockRejectedValue(fileError);
        
        await expect(loadYaml('/nonexistent/file.yaml'))
          .rejects
          .toThrow('File not found');
      });

      it('should handle permission denied errors', async () => {
        const permissionError = new Error('Permission denied');
        mockFs.readFile.mockRejectedValue(permissionError);
        
        await expect(loadYaml('/restricted/file.yaml'))
          .rejects
          .toThrow('Permission denied');
      });

      it('should handle ENOENT errors', async () => {
        const enoentError = new Error('ENOENT: no such file or directory');
        enoentError.name = 'ENOENT';
        mockFs.readFile.mockRejectedValue(enoentError);
        
        await expect(loadYaml('/missing/file.yaml'))
          .rejects
          .toThrow('ENOENT: no such file or directory');
      });

      it('should handle YAML parsing errors', async () => {
        mockFs.readFile.mockResolvedValue('invalid: yaml: content:');
        
        const parseError = new Error('YAML parsing failed');
        mockParseDocument.mockImplementation(() => {
          throw parseError;
        });
        
        await expect(loadYaml('/test/invalid.yaml'))
          .rejects
          .toThrow('YAML parsing failed');
      });

      it('should handle YAML syntax errors', async () => {
        const invalidYaml = `
invalid_yaml:
  - item1
    - invalid_nesting
  key_without_value:
`;
        
        mockFs.readFile.mockResolvedValue(invalidYaml);
        mockParseDocument.mockImplementation(() => {
          throw new Error('Unexpected token');
        });
        
        await expect(loadYaml('/test/syntax-error.yaml'))
          .rejects
          .toThrow('Unexpected token');
      });

      it('should handle malformed YAML with tabs', async () => {
        const tabYaml = `key:\tvalue\n\tindented_with_tab: bad`;
        
        mockFs.readFile.mockResolvedValue(tabYaml);
        mockParseDocument.mockImplementation(() => {
          throw new Error('Tab characters are not allowed in YAML');
        });
        
        await expect(loadYaml('/test/tabs.yaml'))
          .rejects
          .toThrow('Tab characters are not allowed in YAML');
      });

      it('should handle document.toJS() errors', async () => {
        mockFs.readFile.mockResolvedValue('valid: yaml');
        
        const mockDocument = {
          toJS: jest.fn().mockImplementation(() => {
            throw new Error('toJS conversion failed');
          })
        };
        mockParseDocument.mockReturnValue(mockDocument as any);
        
        await expect(loadYaml('/test/conversion-error.yaml'))
          .rejects
          .toThrow('toJS conversion failed');
      });

      it('should handle null document from parseDocument', async () => {
        mockFs.readFile.mockResolvedValue('valid: yaml');
        mockParseDocument.mockReturnValue(null as any);
        
        await expect(loadYaml('/test/null-document.yaml'))
          .rejects
          .toThrow();
      });

      it('should handle undefined document from parseDocument', async () => {
        mockFs.readFile.mockResolvedValue('valid: yaml');
        mockParseDocument.mockReturnValue(undefined as any);
        
        await expect(loadYaml('/test/undefined-document.yaml'))
          .rejects
          .toThrow();
      });
    });

    describe('edge cases', () => {
      it('should handle very large YAML files', async () => {
        const largeObject = { data: new Array(10000).fill('test data') };
        const largeYaml = 'data:\n' + largeObject.data.map(item => `  - "${item}"`).join('\n');
        
        mockFs.readFile.mockResolvedValue(largeYaml);
        const mockDocument = {
          toJS: jest.fn().mockReturnValue(largeObject)
        };
        mockParseDocument.mockReturnValue(mockDocument as any);
        
        const result = await loadYaml('/test/large.yaml');
        
        expect(result.ast).toEqual(largeObject);
        expect(result.raw).toBe(largeYaml);
      });

      it('should handle YAML with deeply nested structures', async () => {
        let deepObject: any = 'value';
        for (let i = 0; i < 100; i++) {
          deepObject = { [`level_${i}`]: deepObject };
        }
        
        mockFs.readFile.mockResolvedValue('deep: structure');
        const mockDocument = {
          toJS: jest.fn().mockReturnValue(deepObject)
        };
        mockParseDocument.mockReturnValue(mockDocument as any);
        
        const result = await loadYaml('/test/deep.yaml');
        
        expect(result.ast).toEqual(deepObject);
      });

      it('should handle YAML with circular references in toJS result', async () => {
        const circularObject: any = { key: 'value' };
        circularObject.self = circularObject;
        
        mockFs.readFile.mockResolvedValue('key: value');
        const mockDocument = {
          toJS: jest.fn().mockReturnValue(circularObject)
        };
        mockParseDocument.mockReturnValue(mockDocument as any);
        
        const result = await loadYaml('/test/circular.yaml');
        
        expect(result.ast).toBe(circularObject);
      });

      it('should handle binary data in YAML', async () => {
        const binaryYaml = 'binary: !!binary |\n  R0lGODlhDAAMAIQAAP//9/X\n  17unp5WZmZgAAAOfn515eXl\n  5OTk6enp56enmleECcgggoBADs=';
        
        mockFs.readFile.mockResolvedValue(binaryYaml);
        const mockDocument = {
          toJS: jest.fn().mockReturnValue({ binary: Buffer.from('test') })
        };
        mockParseDocument.mockReturnValue(mockDocument as any);
        
        const result = await loadYaml('/test/binary.yaml');
        
        expect(result.ast).toHaveProperty('binary');
        expect(result.raw).toBe(binaryYaml);
      });

      it('should handle YAML with custom tags', async () => {
        const customTagYaml = 'custom: !custom-tag value';
        
        mockFs.readFile.mockResolvedValue(customTagYaml);
        const mockDocument = {
          toJS: jest.fn().mockReturnValue({ custom: 'processed-value' })
        };
        mockParseDocument.mockReturnValue(mockDocument as any);
        
        const result = await loadYaml('/test/custom-tags.yaml');
        
        expect(result.ast).toEqual({ custom: 'processed-value' });
        expect(result.raw).toBe(customTagYaml);
      });

      it('should handle absolute file paths', async () => {
        const absolutePath = '/absolute/path/to/file.yaml';
        await loadYaml(absolutePath);
        
        expect(mockFs.readFile).toHaveBeenCalledWith(absolutePath, 'utf8');
      });

      it('should handle relative file paths', async () => {
        const relativePath = './relative/path/file.yaml';
        await loadYaml(relativePath);
        
        expect(mockFs.readFile).toHaveBeenCalledWith(relativePath, 'utf8');
      });

      it('should handle paths with spaces and special characters', async () => {
        const specialPath = '/path with spaces/file[name].yaml';
        await loadYaml(specialPath);
        
        expect(mockFs.readFile).toHaveBeenCalledWith(specialPath, 'utf8');
      });
    });

    describe('ParsedDoc interface compliance', () => {
      it('should return object conforming to ParsedDoc interface', async () => {
        const result = await loadYaml('/test/spec.yaml');
        
        expect(result).toHaveProperty('ast');
        expect(result).toHaveProperty('raw');
        // lineMap is optional and not implemented yet
        
        expect(typeof result.raw).toBe('string');
        expect(result.lineMap).toBeUndefined(); // TODO: not implemented
      });

      it('should handle when AST is null', async () => {
        const mockDocument = {
          toJS: jest.fn().mockReturnValue(null)
        };
        mockParseDocument.mockReturnValue(mockDocument as any);
        
        const result = await loadYaml('/test/empty.yaml');
        
        expect(result.ast).toBeNull();
      });

      it('should handle when AST is undefined', async () => {
        const mockDocument = {
          toJS: jest.fn().mockReturnValue(undefined)
        };
        mockParseDocument.mockReturnValue(mockDocument as any);
        
        const result = await loadYaml('/test/empty.yaml');
        
        expect(result.ast).toBeUndefined();
      });

      it('should handle when AST is a primitive value', async () => {
        const mockDocument = {
          toJS: jest.fn().mockReturnValue('simple string')
        };
        mockParseDocument.mockReturnValue(mockDocument as any);
        
        const result = await loadYaml('/test/primitive.yaml');
        
        expect(result.ast).toBe('simple string');
      });

      it('should handle when AST is an array', async () => {
        const arrayResult = ['item1', 'item2', 'item3'];
        const mockDocument = {
          toJS: jest.fn().mockReturnValue(arrayResult)
        };
        mockParseDocument.mockReturnValue(mockDocument as any);
        
        const result = await loadYaml('/test/array.yaml');
        
        expect(result.ast).toEqual(arrayResult);
      });
    });

    describe('keepNodeTypes option', () => {
      it('should pass keepNodeTypes: true to parseDocument', async () => {
        await loadYaml('/test/spec.yaml');
        
        expect(mockParseDocument).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ keepNodeTypes: true })
        );
      });

      it('should handle when parseDocument receives different options', async () => {
        // Test that our specific options are passed correctly
        await loadYaml('/test/spec.yaml');
        
        const call = mockParseDocument.mock.calls[0];
        expect(call[1]).toEqual(expect.objectContaining({ keepNodeTypes: true }));
      });
    });
  });
});
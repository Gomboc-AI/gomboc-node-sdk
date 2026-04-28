import { TypescriptLanguageHandler } from './handler';

const typescriptContent = [
  'interface User {',
  '  id: string;',
  '}',
  '',
  'class Service {',
  '  run(): boolean {',
  '    return true;',
  '  }',
  '}',
  '',
  'function helper(): number {',
  '  return 1;',
  '}',
].join('\n');

describe('TypescriptLanguageHandler', () => {
  const handler = new TypescriptLanguageHandler();

  describe('detectLanguage', () => {
    it('detects typescript extensions and rejects non-ts files', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/app.ts',
          content: typescriptContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/component.tsx',
          content: typescriptContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/app.js',
          content: typescriptContent,
        })
      ).toBe(false);
    });

    it('is extension-case insensitive', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/APP.TS',
          content: typescriptContent,
        })
      ).toBe(true);
    });
  });

  describe('getDocumentInfo', () => {
    it('returns typescript document metadata', () => {
      expect(
        handler.getDocumentInfo({
          filePath: '/workspace/app.ts',
          content: typescriptContent,
        })
      ).toMatchObject({
        languageId: 'typescript',
        fileName: 'app.ts',
        extension: '.ts',
        supportsBlocks: true,
        isConfigLike: false,
      });
    });
  });

  describe('listBlocks', () => {
    it('parses type declarations, methods, and functions', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/app.ts',
        content: typescriptContent,
      });
      expect(blocks).toHaveLength(4);
      expect(blocks[0]).toMatchObject({
        type: 'typescript_interface',
        name: 'User',
        startLine: 1,
        endLine: 3,
      });
      expect(blocks[1]).toMatchObject({
        type: 'typescript_class',
        name: 'Service',
        startLine: 5,
        endLine: 9,
      });
      expect(blocks[2]).toMatchObject({
        type: 'typescript_method',
        name: 'run',
        startLine: 6,
        endLine: 8,
      });
      expect(blocks[3]).toMatchObject({
        type: 'typescript_function',
        name: 'helper',
        startLine: 11,
        endLine: 13,
      });
    });

    it('returns empty for empty content and no parseable blocks', () => {
      expect(
        handler.listBlocks({ filePath: '/workspace/app.ts', content: '' })
      ).toEqual([]);
      expect(
        handler.listBlocks({
          filePath: '/workspace/app.ts',
          content: ['const x: number = 1;', 'x++;'].join('\n'),
        })
      ).toEqual([]);
    });
  });

  describe('findBlockAtLine', () => {
    it('returns innermost block and null in gaps', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/app.ts',
          content: typescriptContent,
          line: 7,
        })?.name
      ).toBe('run');
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/app.ts',
          content: typescriptContent,
          line: 10,
        })
      ).toBeNull();
    });

    it('treats non-positive line values as line 1', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/app.ts',
          content: typescriptContent,
          line: 0,
        })?.name
      ).toBe('User');
    });
  });

  describe('findNearestBlock', () => {
    it('returns first, previous, and last as expected', () => {
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/app.ts',
          content: typescriptContent,
          line: 1,
        })?.name
      ).toBe('User');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/app.ts',
          content: typescriptContent,
          line: 10,
        })?.name
      ).toBe('run');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/app.ts',
          content: typescriptContent,
          line: 99,
        })?.name
      ).toBe('helper');
    });
  });

  describe('resolveDiagnosticAnchorLine', () => {
    const anchorContent = [
      'class Service {',
      '  run(): boolean {',
      '  }',
      '',
      '// trailing comment',
    ].join('\n');

    it('covers fix-operation, weak-line fallback, and invalid inputs', () => {
      expect(
        handler.resolveDiagnosticAnchorLine({
          content: anchorContent,
          suggestedLine: 2,
          fromFixOperation: true,
        })
      ).toEqual({ line: 2, character: 2 });
      expect(
        handler.resolveDiagnosticAnchorLine({
          content: anchorContent,
          suggestedLine: 999,
          fromFixOperation: true,
        })
      ).toEqual({ line: 5, character: 0 });
      expect(
        handler.resolveDiagnosticAnchorLine({
          content: anchorContent,
          suggestedLine: 3,
          fromFixOperation: false,
        })
      ).toEqual({ line: 2, character: 2 });
      expect(
        handler.resolveDiagnosticAnchorLine({
          content: anchorContent,
          suggestedLine: 0,
          fromFixOperation: false,
        })
      ).toEqual({ line: 1, character: 0 });
      expect(
        handler.resolveDiagnosticAnchorLine({
          content: anchorContent,
          suggestedLine: -5,
          fromFixOperation: false,
        })
      ).toEqual({ line: 1, character: 0 });
      expect(
        handler.resolveDiagnosticAnchorLine({
          content: anchorContent,
          suggestedLine: Number.NaN,
          fromFixOperation: false,
        })
      ).toEqual({ line: 1, character: 0 });
      expect(
        handler.resolveDiagnosticAnchorLine({
          content: anchorContent,
          suggestedLine: 3.9,
          fromFixOperation: true,
        })
      ).toEqual({ line: 3, character: 2 });
    });

    it('handles empty and undefined content safely', () => {
      expect(
        handler.resolveDiagnosticAnchorLine({
          content: '',
          suggestedLine: 99,
          fromFixOperation: true,
        })
      ).toEqual({ line: 1, character: 0 });
      expect(
        handler.resolveDiagnosticAnchorLine({
          content: undefined as unknown as string,
          suggestedLine: 5,
          fromFixOperation: true,
        })
      ).toEqual({ line: 1, character: 0 });
    });
  });
});

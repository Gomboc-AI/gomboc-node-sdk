import { KotlinLanguageHandler } from './handler';

const kotlinContent = [
  'class Service {',
  '  fun run(): Boolean {',
  '    return true',
  '  }',
  '}',
  '',
  'fun helper(): Int {',
  '  return 1',
  '}',
].join('\n');

describe('KotlinLanguageHandler', () => {
  const handler = new KotlinLanguageHandler();

  describe('detectLanguage', () => {
    it('detects kotlin extension and rejects non-kotlin files', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/App.kt',
          content: kotlinContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/build.gradle.kts',
          content: kotlinContent,
        })
      ).toBe(false);
    });

    it('is extension-case insensitive', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/APP.KT',
          content: kotlinContent,
        })
      ).toBe(true);
    });
  });

  describe('getDocumentInfo', () => {
    it('returns kotlin document metadata', () => {
      expect(
        handler.getDocumentInfo({
          filePath: '/workspace/App.kt',
          content: kotlinContent,
        })
      ).toMatchObject({
        languageId: 'kotlin',
        fileName: 'App.kt',
        extension: '.kt',
        supportsBlocks: true,
        isConfigLike: false,
      });
    });
  });

  describe('listBlocks', () => {
    it('parses classes and functions with expected metadata', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/App.kt',
        content: kotlinContent,
      });
      expect(blocks).toHaveLength(3);
      expect(blocks[0]).toMatchObject({
        type: 'kotlin_class',
        name: 'Service',
        startLine: 1,
        endLine: 5,
      });
      expect(blocks[1]).toMatchObject({
        type: 'kotlin_function',
        name: 'run',
        startLine: 2,
        endLine: 4,
      });
      expect(blocks[2]).toMatchObject({
        type: 'kotlin_function',
        name: 'helper',
        startLine: 7,
        endLine: 9,
      });
    });

    it('returns empty for empty content and no parseable blocks', () => {
      expect(
        handler.listBlocks({ filePath: '/workspace/App.kt', content: '' })
      ).toEqual([]);
      expect(
        handler.listBlocks({
          filePath: '/workspace/App.kt',
          content: ['val x = 1', 'println(x)'].join('\n'),
        })
      ).toEqual([]);
    });
  });

  describe('findBlockAtLine', () => {
    it('returns innermost block and null in gaps', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/App.kt',
          content: kotlinContent,
          line: 3,
        })?.name
      ).toBe('run');
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/App.kt',
          content: kotlinContent,
          line: 6,
        })
      ).toBeNull();
    });

    it('treats non-positive line values as line 1', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/App.kt',
          content: kotlinContent,
          line: 0,
        })?.name
      ).toBe('Service');
    });
  });

  describe('findNearestBlock', () => {
    it('returns first, previous, and last as expected', () => {
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/App.kt',
          content: kotlinContent,
          line: 1,
        })?.name
      ).toBe('Service');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/App.kt',
          content: kotlinContent,
          line: 6,
        })?.name
      ).toBe('run');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/App.kt',
          content: kotlinContent,
          line: 99,
        })?.name
      ).toBe('helper');
    });
  });

  describe('resolveDiagnosticAnchorLine', () => {
    const anchorContent = [
      'class Service {',
      '  fun run(): Boolean {',
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

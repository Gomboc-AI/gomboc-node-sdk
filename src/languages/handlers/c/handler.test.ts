import { CLanguageHandler } from './handler';

const cContent = [
  '#include <stdio.h>',
  '',
  'static int add(int a, int b) {',
  '  return a + b;',
  '}',
  '',
  'int main(void) {',
  '  printf("%d\\n", add(1, 2));',
  '  return 0;',
  '}',
].join('\n');

describe('CLanguageHandler', () => {
  const handler = new CLanguageHandler();

  describe('detectLanguage', () => {
    it('detects c/header files and ignores non-c extensions', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/main.c',
          content: cContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/main.h',
          content: cContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/main.cpp',
          content: cContent,
        })
      ).toBe(false);
    });

    it('is extension-case insensitive', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/MAIN.C',
          content: cContent,
        })
      ).toBe(true);
    });
  });

  describe('getDocumentInfo', () => {
    it('returns c document metadata', () => {
      expect(
        handler.getDocumentInfo({
          filePath: '/workspace/main.c',
          content: cContent,
        })
      ).toMatchObject({
        languageId: 'c',
        fileName: 'main.c',
        extension: '.c',
        supportsBlocks: true,
        isConfigLike: false,
      });
    });
  });

  describe('listBlocks', () => {
    it('parses function blocks with expected ranges', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/main.c',
        content: cContent,
      });
      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toMatchObject({
        type: 'c_function',
        name: 'add',
        startLine: 3,
        endLine: 5,
        header: 'function add()',
      });
      expect(blocks[1]).toMatchObject({
        type: 'c_function',
        name: 'main',
        startLine: 7,
        endLine: 10,
      });
    });

    it('returns empty for empty and unparsable files', () => {
      expect(
        handler.listBlocks({ filePath: '/workspace/main.c', content: '' })
      ).toEqual([]);
      expect(
        handler.listBlocks({
          filePath: '/workspace/main.c',
          content: ['int value = 1;', 'value++;'].join('\n'),
        })
      ).toEqual([]);
    });

    it('ignores control-flow blocks that look like function signatures', () => {
      const content = [
        'int main(void) {',
        '  if (1) {',
        '    return 1;',
        '  }',
        '  return 0;',
        '}',
      ].join('\n');
      const blocks = handler.listBlocks({
        filePath: '/workspace/main.c',
        content,
      });
      expect(blocks).toHaveLength(1);
      expect(blocks[0].name).toBe('main');
    });
  });

  describe('findBlockAtLine', () => {
    it('returns containing block boundaries and null for gaps', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/main.c',
          content: cContent,
          line: 3,
        })?.name
      ).toBe('add');
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/main.c',
          content: cContent,
          line: 5,
        })?.name
      ).toBe('add');
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/main.c',
          content: cContent,
          line: 6,
        })
      ).toBeNull();
    });

    it('treats non-positive lines as line 1', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/main.c',
          content: cContent,
          line: 0,
        })
      ).toBeNull();
    });
  });

  describe('findNearestBlock', () => {
    it('returns first before file, previous in gap, and last after file', () => {
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/main.c',
          content: cContent,
          line: 1,
        })?.name
      ).toBe('add');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/main.c',
          content: cContent,
          line: 6,
        })?.name
      ).toBe('add');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/main.c',
          content: cContent,
          line: 99,
        })?.name
      ).toBe('main');
    });
  });

  describe('resolveDiagnosticAnchorLine', () => {
    const anchorContent = [
      'int main(void) {',
      '  return 0;',
      '}',
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
      ).toEqual({ line: 3, character: 0 });
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

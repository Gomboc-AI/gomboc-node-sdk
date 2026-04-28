import { CppLanguageHandler } from './handler';

const cppContent = [
  'class Service {',
  'public:',
  '  void run() {',
  '    helper();',
  '  }',
  '};',
  '',
  'int helper() {',
  '  return 1;',
  '}',
].join('\n');

describe('CppLanguageHandler', () => {
  const handler = new CppLanguageHandler();

  describe('detectLanguage', () => {
    it('detects common cpp extensions and ignores non-cpp', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/main.cpp',
          content: cppContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/main.hpp',
          content: cppContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/main.c',
          content: cppContent,
        })
      ).toBe(false);
    });

    it('is extension-case insensitive', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/MAIN.CPP',
          content: cppContent,
        })
      ).toBe(true);
    });
  });

  describe('getDocumentInfo', () => {
    it('returns cpp document metadata', () => {
      expect(
        handler.getDocumentInfo({
          filePath: '/workspace/main.cpp',
          content: cppContent,
        })
      ).toMatchObject({
        languageId: 'cpp',
        fileName: 'main.cpp',
        extension: '.cpp',
        supportsBlocks: true,
        isConfigLike: false,
      });
    });
  });

  describe('listBlocks', () => {
    it('parses class and function blocks with expected metadata', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/main.cpp',
        content: cppContent,
      });
      expect(blocks).toHaveLength(3);
      expect(blocks[0]).toMatchObject({
        type: 'cpp_class',
        name: 'Service',
        startLine: 1,
        endLine: 6,
        header: 'class Service',
      });
      expect(blocks[1]).toMatchObject({
        type: 'cpp_function',
        name: 'run',
        startLine: 3,
        endLine: 5,
      });
      expect(blocks[2]).toMatchObject({
        type: 'cpp_function',
        name: 'helper',
        startLine: 8,
        endLine: 10,
      });
    });

    it('returns empty for empty files and files with no parseable blocks', () => {
      expect(
        handler.listBlocks({ filePath: '/workspace/main.cpp', content: '' })
      ).toEqual([]);
      expect(
        handler.listBlocks({
          filePath: '/workspace/main.cpp',
          content: ['int x = 1;', 'x++;'].join('\n'),
        })
      ).toEqual([]);
    });

    it('parses struct blocks and scoped method definitions', () => {
      const content = [
        'struct Item {',
        '  int value;',
        '};',
        '',
        'int Item::compute() {',
        '  return value;',
        '}',
      ].join('\n');
      const blocks = handler.listBlocks({
        filePath: '/workspace/item.cpp',
        content,
      });
      expect(blocks.find(block => block.type === 'cpp_struct')?.name).toBe(
        'Item'
      );
      expect(
        blocks.find(
          block => block.type === 'cpp_function' && block.name === 'compute'
        )
      ).toBeDefined();
    });
  });

  describe('findBlockAtLine', () => {
    it('returns innermost block and null in gaps', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/main.cpp',
          content: cppContent,
          line: 4,
        })?.name
      ).toBe('run');
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/main.cpp',
          content: cppContent,
          line: 7,
        })
      ).toBeNull();
    });

    it('treats non-positive lines as line 1', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/main.cpp',
          content: cppContent,
          line: 0,
        })?.name
      ).toBe('Service');
    });
  });

  describe('findNearestBlock', () => {
    it('returns first before file, previous in gaps, and last after file', () => {
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/main.cpp',
          content: cppContent,
          line: 1,
        })?.name
      ).toBe('Service');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/main.cpp',
          content: cppContent,
          line: 7,
        })?.name
      ).toBe('run');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/main.cpp',
          content: cppContent,
          line: 99,
        })?.name
      ).toBe('helper');
    });
  });

  describe('resolveDiagnosticAnchorLine', () => {
    const anchorContent = [
      'class Service {',
      '  void run();',
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

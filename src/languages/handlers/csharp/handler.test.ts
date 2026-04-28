import { CsharpLanguageHandler } from './handler';

const csharpContent = [
  'namespace Demo;',
  '',
  'public class Service {',
  '  public int Add(int a, int b) {',
  '    return a + b;',
  '  }',
  '}',
  '',
  'internal static class Program {',
  '  public static void Main(string[] args) {',
  '    var service = new Service();',
  '    _ = service.Add(1, 2);',
  '  }',
  '}',
].join('\n');

describe('CsharpLanguageHandler', () => {
  const handler = new CsharpLanguageHandler();

  describe('detectLanguage', () => {
    it('detects csharp extensions and ignores non-csharp extensions', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/Program.cs',
          content: csharpContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/script.csx',
          content: 'System.Console.WriteLine("ok");',
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/main.java',
          content: csharpContent,
        })
      ).toBe(false);
    });

    it('is extension-case insensitive', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/PROGRAM.CS',
          content: csharpContent,
        })
      ).toBe(true);
    });
  });

  describe('getDocumentInfo', () => {
    it('returns csharp document metadata', () => {
      expect(
        handler.getDocumentInfo({
          filePath: '/workspace/Program.cs',
          content: csharpContent,
        })
      ).toMatchObject({
        languageId: 'csharp',
        fileName: 'Program.cs',
        extension: '.cs',
        supportsBlocks: true,
        isConfigLike: false,
      });
    });
  });

  describe('listBlocks', () => {
    it('parses class and method blocks with expected metadata', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/Program.cs',
        content: csharpContent,
      });
      expect(blocks).toHaveLength(4);
      expect(blocks[0]).toMatchObject({
        type: 'csharp_class',
        name: 'Service',
        startLine: 3,
        endLine: 7,
        header: 'class Service',
      });
      expect(blocks[1]).toMatchObject({
        type: 'csharp_method',
        name: 'Add',
        startLine: 4,
        endLine: 6,
        header: 'method Add()',
      });
      expect(blocks[2]).toMatchObject({
        type: 'csharp_class',
        name: 'Program',
        startLine: 9,
        endLine: 14,
      });
      expect(blocks[3]).toMatchObject({
        type: 'csharp_method',
        name: 'Main',
        startLine: 10,
        endLine: 13,
      });
    });

    it('returns empty for empty files and files without parseable blocks', () => {
      expect(
        handler.listBlocks({ filePath: '/workspace/Program.cs', content: '' })
      ).toEqual([]);
      expect(
        handler.listBlocks({
          filePath: '/workspace/Program.cs',
          content: ['using System;', 'var value = 1;'].join('\n'),
        })
      ).toEqual([]);
    });

    it('ignores control-flow statements that resemble methods', () => {
      const content = [
        'public class Service {',
        '  public int Run() {',
        '    if (true) {',
        '      return 1;',
        '    }',
        '    return 0;',
        '  }',
        '}',
      ].join('\n');
      const blocks = handler.listBlocks({
        filePath: '/workspace/Program.cs',
        content,
      });
      expect(
        blocks.filter(block => block.type === 'csharp_method').map(b => b.name)
      ).toEqual(['Run']);
    });
  });

  describe('findBlockAtLine', () => {
    it('returns innermost block and null for gaps', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/Program.cs',
          content: csharpContent,
          line: 5,
        })?.name
      ).toBe('Add');
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/Program.cs',
          content: csharpContent,
          line: 8,
        })
      ).toBeNull();
    });

    it('treats non-positive lines as line 1', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/Program.cs',
          content: csharpContent,
          line: 0,
        })
      ).toBeNull();
    });
  });

  describe('findNearestBlock', () => {
    it('returns first before file, previous in gap, and last after file', () => {
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/Program.cs',
          content: csharpContent,
          line: 1,
        })?.name
      ).toBe('Service');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/Program.cs',
          content: csharpContent,
          line: 8,
        })?.name
      ).toBe('Add');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/Program.cs',
          content: csharpContent,
          line: 99,
        })?.name
      ).toBe('Main');
    });
  });

  describe('resolveDiagnosticAnchorLine', () => {
    const anchorContent = [
      'public class Service {',
      '  public int Add(int a, int b) {',
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

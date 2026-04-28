import { OcamlLanguageHandler } from './handler';

const ocamlContent = [
  'module Math = struct',
  '  let add a b =',
  '    a + b',
  'end',
  '',
  'let greet name =',
  '  "hello " ^ name',
].join('\n');

describe('OcamlLanguageHandler', () => {
  const handler = new OcamlLanguageHandler();

  describe('detectLanguage', () => {
    it('detects ocaml extensions and rejects non-ocaml files', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/main.ml',
          content: ocamlContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/main.mli',
          content: ocamlContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/main.rs',
          content: ocamlContent,
        })
      ).toBe(false);
    });

    it('is extension-case insensitive', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/MAIN.ML',
          content: ocamlContent,
        })
      ).toBe(true);
    });
  });

  describe('getDocumentInfo', () => {
    it('returns ocaml document metadata', () => {
      expect(
        handler.getDocumentInfo({
          filePath: '/workspace/main.ml',
          content: ocamlContent,
        })
      ).toMatchObject({
        languageId: 'ocaml',
        fileName: 'main.ml',
        extension: '.ml',
        supportsBlocks: true,
        isConfigLike: false,
      });
    });
  });

  describe('listBlocks', () => {
    it('parses module and let blocks with expected metadata', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/main.ml',
        content: ocamlContent,
      });
      expect(blocks).toHaveLength(3);
      expect(blocks[0]).toMatchObject({
        type: 'ocaml_module',
        name: 'Math',
        startLine: 1,
        endLine: 4,
      });
      expect(blocks[1]).toMatchObject({
        type: 'ocaml_let',
        name: 'add',
        startLine: 2,
        endLine: 4,
      });
      expect(blocks[2]).toMatchObject({
        type: 'ocaml_let',
        name: 'greet',
        startLine: 6,
        endLine: 7,
      });
    });

    it('parses multiple lets and module boundaries correctly', () => {
      const content = [
        'let first = 1',
        'let second =',
        '  first + 1',
        'module X = struct',
        '  let inside = 1',
        'end',
      ].join('\n');
      const blocks = handler.listBlocks({
        filePath: '/workspace/main.ml',
        content,
      });
      expect(blocks.map(block => block.name)).toEqual([
        'first',
        'second',
        'X',
        'inside',
      ]);
    });

    it('returns empty for empty files and files without parseable blocks', () => {
      expect(
        handler.listBlocks({ filePath: '/workspace/main.ml', content: '' })
      ).toEqual([]);
      expect(
        handler.listBlocks({
          filePath: '/workspace/main.ml',
          content: ['type t = int', 'exception Boom'].join('\n'),
        })
      ).toEqual([]);
    });
  });

  describe('findBlockAtLine', () => {
    it('returns innermost block and null in gaps', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/main.ml',
          content: ocamlContent,
          line: 3,
        })?.name
      ).toBe('add');
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/main.ml',
          content: ocamlContent,
          line: 5,
        })
      ).toBeNull();
    });

    it('treats non-positive lines as line 1', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/main.ml',
          content: ocamlContent,
          line: 0,
        })?.name
      ).toBe('Math');
    });
  });

  describe('findNearestBlock', () => {
    it('returns first, previous, and last as expected', () => {
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/main.ml',
          content: ocamlContent,
          line: 1,
        })?.name
      ).toBe('Math');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/main.ml',
          content: ocamlContent,
          line: 5,
        })?.name
      ).toBe('add');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/main.ml',
          content: ocamlContent,
          line: 999,
        })?.name
      ).toBe('greet');
    });
  });

  describe('resolveDiagnosticAnchorLine', () => {
    const anchorContent = [
      'let value =',
      '  1',
      '',
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
          suggestedLine: 4,
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

import { JsonLanguageHandler } from './handler';

const jsonContent = JSON.stringify(
  {
    name: 'demo',
    scripts: {
      test: 'jest',
    },
    version: '1.0.0',
  },
  null,
  2
);

describe('JsonLanguageHandler', () => {
  const handler = new JsonLanguageHandler();

  describe('detectLanguage', () => {
    it('detects json extension and rejects non-json files', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/data.json',
          content: jsonContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/data.yaml',
          content: jsonContent,
        })
      ).toBe(false);
    });

    it('is extension-case insensitive', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/DATA.JSON',
          content: jsonContent,
        })
      ).toBe(true);
    });
  });

  describe('getDocumentInfo', () => {
    it('returns json document metadata', () => {
      expect(
        handler.getDocumentInfo({
          filePath: '/workspace/data.json',
          content: jsonContent,
        })
      ).toMatchObject({
        languageId: 'json',
        fileName: 'data.json',
        extension: '.json',
        supportsBlocks: true,
        isConfigLike: true,
      });
    });
  });

  describe('listBlocks', () => {
    it('parses top-level json properties into blocks', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/data.json',
        content: jsonContent,
      });
      expect(blocks).toHaveLength(3);
      expect(blocks[0]).toMatchObject({
        type: 'json_property',
        name: 'name',
        header: '"name"',
      });
      expect(blocks[1]).toMatchObject({
        type: 'json_property',
        name: 'scripts',
        header: '"scripts"',
      });
      expect(blocks[2]).toMatchObject({
        type: 'json_property',
        name: 'version',
        header: '"version"',
      });
      expect(blocks[0].startLine).toBeLessThan(blocks[1].startLine);
      expect(blocks[1].startLine).toBeLessThan(blocks[2].startLine);
    });

    it('returns empty for empty, invalid, and non-object json', () => {
      expect(
        handler.listBlocks({ filePath: '/workspace/data.json', content: '' })
      ).toEqual([]);
      expect(
        handler.listBlocks({
          filePath: '/workspace/data.json',
          content: '{ invalid',
        })
      ).toEqual([]);
      expect(
        handler.listBlocks({
          filePath: '/workspace/data.json',
          content: JSON.stringify(['a', 'b']),
        })
      ).toEqual([]);
    });
  });

  describe('findBlockAtLine', () => {
    it('returns containing block at boundaries and null in gaps', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/data.json',
        content: jsonContent,
      });
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/data.json',
          content: jsonContent,
          line: blocks[0].startLine,
        })?.name
      ).toBe('name');
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/data.json',
          content: jsonContent,
          line: 1,
        })
      ).toBeNull();
    });

    it('treats non-positive line values as line 1', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/data.json',
          content: jsonContent,
          line: 0,
        })
      ).toBeNull();
    });
  });

  describe('findNearestBlock', () => {
    it('returns first, previous, and last as expected', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/data.json',
        content: jsonContent,
      });
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/data.json',
          content: jsonContent,
          line: 1,
        })?.name
      ).toBe('name');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/data.json',
          content: jsonContent,
          line: blocks[1].endLine + 1,
        })?.name
      ).toBe('version');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/data.json',
          content: jsonContent,
          line: 999,
        })?.name
      ).toBe('version');
    });
  });

  describe('resolveDiagnosticAnchorLine', () => {
    const anchorContent = [
      '{',
      '  "name": "demo",',
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

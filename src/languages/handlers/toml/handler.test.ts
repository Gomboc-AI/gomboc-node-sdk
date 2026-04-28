import { TomlLanguageHandler } from './handler';

const tomlContent = [
  'title = "Demo"',
  '',
  '[server]',
  'port = 8080',
  '',
  '[[database.replica]]',
  'host = "db-1"',
  '',
  '[[database.replica]]',
  'host = "db-2"',
].join('\n');

describe('TomlLanguageHandler', () => {
  const handler = new TomlLanguageHandler();

  describe('detectLanguage', () => {
    it('detects toml extensions and rejects non-toml files', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/config.toml',
          content: tomlContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/CONFIG.TOML',
          content: tomlContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/config.yaml',
          content: tomlContent,
        })
      ).toBe(false);
    });
  });

  describe('getDocumentInfo', () => {
    it('returns toml document metadata', () => {
      expect(
        handler.getDocumentInfo({
          filePath: '/workspace/config.toml',
          content: tomlContent,
        })
      ).toMatchObject({
        languageId: 'toml',
        fileName: 'config.toml',
        extension: '.toml',
        supportsBlocks: true,
        isConfigLike: true,
      });
    });
  });

  describe('listBlocks', () => {
    it('parses table and array-of-table sections', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/config.toml',
        content: tomlContent,
      });
      expect(blocks).toHaveLength(3);
      expect(blocks[0]).toMatchObject({
        type: 'toml_table',
        name: 'server',
        startLine: 3,
        endLine: 5,
      });
      expect(blocks[1]).toMatchObject({
        type: 'toml_array_table',
        name: 'database.replica',
        startLine: 6,
      });
    });

    it('returns empty for empty or key-only files', () => {
      expect(
        handler.listBlocks({ filePath: '/workspace/config.toml', content: '' })
      ).toEqual([]);
      expect(
        handler.listBlocks({
          filePath: '/workspace/config.toml',
          content: ['title = "Demo"', 'enabled = true'].join('\n'),
        })
      ).toEqual([]);
    });
  });

  describe('findBlockAtLine', () => {
    it('returns containing block and null before first section', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/config.toml',
          content: tomlContent,
          line: 4,
        })?.name
      ).toBe('server');
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/config.toml',
          content: tomlContent,
          line: 1,
        })
      ).toBeNull();
    });

    it('treats non-positive lines as line 1', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/config.toml',
          content: tomlContent,
          line: 0,
        })
      ).toBeNull();
    });
  });

  describe('findNearestBlock', () => {
    it('returns first, previous, and last as expected', () => {
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/config.toml',
          content: tomlContent,
          line: 1,
        })?.name
      ).toBe('server');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/config.toml',
          content: tomlContent,
          line: 8,
        })?.name
      ).toBe('database.replica');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/config.toml',
          content: tomlContent,
          line: 999,
        })?.name
      ).toBe('database.replica');
    });
  });

  describe('resolveDiagnosticAnchorLine', () => {
    const anchorContent = [
      '[server]',
      'port = 8080',
      '',
      '',
      '# trailing comment',
    ].join('\n');

    it('covers fix-operation, weak-line fallback, and invalid inputs', () => {
      expect(
        handler.resolveDiagnosticAnchorLine({
          content: anchorContent,
          suggestedLine: 2,
          fromFixOperation: true,
        })
      ).toEqual({ line: 2, character: 0 });
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
      ).toEqual({ line: 2, character: 0 });
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

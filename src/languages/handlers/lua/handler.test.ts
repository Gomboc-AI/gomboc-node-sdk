import { LuaLanguageHandler } from './handler';

const luaContent = [
  'local function run()',
  '  return true',
  'end',
  '',
  'function helper()',
  '  return 1',
  'end',
].join('\n');

describe('LuaLanguageHandler', () => {
  const handler = new LuaLanguageHandler();

  describe('detectLanguage', () => {
    it('detects lua extension and rejects non-lua files', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/main.lua',
          content: luaContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/main.py',
          content: luaContent,
        })
      ).toBe(false);
    });

    it('is extension-case insensitive', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/MAIN.LUA',
          content: luaContent,
        })
      ).toBe(true);
    });
  });

  describe('getDocumentInfo', () => {
    it('returns lua document metadata', () => {
      expect(
        handler.getDocumentInfo({
          filePath: '/workspace/main.lua',
          content: luaContent,
        })
      ).toMatchObject({
        languageId: 'lua',
        fileName: 'main.lua',
        extension: '.lua',
        supportsBlocks: true,
        isConfigLike: false,
      });
    });
  });

  describe('listBlocks', () => {
    it('parses lua function blocks with expected metadata', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/main.lua',
        content: luaContent,
      });
      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toMatchObject({
        type: 'lua_function',
        name: 'run',
        startLine: 1,
        endLine: 3,
      });
      expect(blocks[1]).toMatchObject({
        type: 'lua_function',
        name: 'helper',
        startLine: 5,
        endLine: 7,
      });
    });

    it('returns empty for empty files and files without functions', () => {
      expect(
        handler.listBlocks({ filePath: '/workspace/main.lua', content: '' })
      ).toEqual([]);
      expect(
        handler.listBlocks({
          filePath: '/workspace/main.lua',
          content: ['local x = 1', 'x = x + 1'].join('\n'),
        })
      ).toEqual([]);
    });
  });

  describe('findBlockAtLine', () => {
    it('returns block boundaries and null in gaps', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/main.lua',
          content: luaContent,
          line: 1,
        })?.name
      ).toBe('run');
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/main.lua',
          content: luaContent,
          line: 4,
        })
      ).toBeNull();
    });

    it('treats non-positive lines as line 1', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/main.lua',
          content: luaContent,
          line: 0,
        })?.name
      ).toBe('run');
    });
  });

  describe('findNearestBlock', () => {
    it('returns first, previous, and last as expected', () => {
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/main.lua',
          content: luaContent,
          line: 1,
        })?.name
      ).toBe('run');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/main.lua',
          content: luaContent,
          line: 4,
        })?.name
      ).toBe('run');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/main.lua',
          content: luaContent,
          line: 99,
        })?.name
      ).toBe('helper');
    });
  });

  describe('resolveDiagnosticAnchorLine', () => {
    const anchorContent = [
      'function run()',
      '  return true',
      'end',
      '',
      '-- trailing comment',
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
      ).toEqual({ line: 3, character: 0 });
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

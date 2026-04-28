import { SqlLanguageHandler } from './handler';

const sqlContent = [
  'CREATE TABLE users (',
  '  id INTEGER PRIMARY KEY,',
  '  name TEXT',
  ');',
  '',
  'CREATE VIEW active_users AS',
  'SELECT id, name FROM users;',
].join('\n');

describe('SqlLanguageHandler', () => {
  const handler = new SqlLanguageHandler();

  describe('detectLanguage', () => {
    it('detects sql extensions and rejects non-sql files', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/schema.sql',
          content: sqlContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/SCHEMA.SQL',
          content: sqlContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/schema.txt',
          content: sqlContent,
        })
      ).toBe(false);
    });
  });

  describe('getDocumentInfo', () => {
    it('returns sql document metadata', () => {
      expect(
        handler.getDocumentInfo({
          filePath: '/workspace/schema.sql',
          content: sqlContent,
        })
      ).toMatchObject({
        languageId: 'sql',
        fileName: 'schema.sql',
        extension: '.sql',
        supportsBlocks: true,
        isConfigLike: false,
      });
    });
  });

  describe('listBlocks', () => {
    it('parses common create statements into statement blocks', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/schema.sql',
        content: sqlContent,
      });
      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toMatchObject({
        type: 'sql_statement',
        name: 'users',
        startLine: 1,
        endLine: 4,
      });
      expect(blocks[1]).toMatchObject({
        type: 'sql_statement',
        name: 'active_users',
        startLine: 6,
        endLine: 7,
      });
    });

    it('supports quoted identifiers and ignores comment-only files', () => {
      const quoted = [
        '-- migrate',
        'CREATE OR REPLACE FUNCTION "do_work"()',
        'RETURNS void AS $$',
        'BEGIN',
        'END;',
      ].join('\n');
      const blocks = handler.listBlocks({
        filePath: '/workspace/schema.sql',
        content: quoted,
      });
      expect(blocks[0]).toMatchObject({ name: 'do_work' });
      expect(
        handler.listBlocks({
          filePath: '/workspace/schema.sql',
          content: '-- comment\n-- still comment',
        })
      ).toEqual([]);
    });
  });

  describe('findBlockAtLine', () => {
    it('returns containing block and null in gaps', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/schema.sql',
          content: sqlContent,
          line: 2,
        })?.name
      ).toBe('users');
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/schema.sql',
          content: sqlContent,
          line: 5,
        })
      ).toBeNull();
    });

    it('treats non-positive lines as line 1', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/schema.sql',
          content: sqlContent,
          line: 0,
        })?.name
      ).toBe('users');
    });
  });

  describe('findNearestBlock', () => {
    it('returns first, previous, and last as expected', () => {
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/schema.sql',
          content: sqlContent,
          line: 1,
        })?.name
      ).toBe('users');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/schema.sql',
          content: sqlContent,
          line: 5,
        })?.name
      ).toBe('users');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/schema.sql',
          content: sqlContent,
          line: 999,
        })?.name
      ).toBe('active_users');
    });
  });

  describe('resolveDiagnosticAnchorLine', () => {
    const anchorContent = [
      'CREATE TABLE users (',
      '  id INTEGER PRIMARY KEY,',
      ');',
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

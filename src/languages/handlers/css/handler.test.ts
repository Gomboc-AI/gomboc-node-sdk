import { CssLanguageHandler } from './handler';

const cssContent = [
  '.container {',
  '  color: red;',
  '}',
  '',
  '@media (min-width: 768px) {',
  '  .container {',
  '    color: blue;',
  '  }',
  '}',
].join('\n');

describe('CssLanguageHandler', () => {
  const handler = new CssLanguageHandler();

  describe('detectLanguage', () => {
    it('detects css extensions and ignores non-css extensions', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/styles.css',
          content: cssContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/styles.scss',
          content: cssContent,
        })
      ).toBe(false);
    });

    it('is extension-case insensitive', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/STYLES.CSS',
          content: cssContent,
        })
      ).toBe(true);
    });
  });

  describe('getDocumentInfo', () => {
    it('returns css document metadata', () => {
      expect(
        handler.getDocumentInfo({
          filePath: '/workspace/styles.css',
          content: cssContent,
        })
      ).toMatchObject({
        languageId: 'css',
        fileName: 'styles.css',
        extension: '.css',
        supportsBlocks: true,
        isConfigLike: false,
      });
    });
  });

  describe('listBlocks', () => {
    it('parses selector and at-rule blocks with expected ranges', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/styles.css',
        content: cssContent,
      });
      expect(blocks).toHaveLength(3);
      expect(blocks[0]).toMatchObject({
        type: 'css_rule',
        name: '.container',
        startLine: 1,
        endLine: 3,
        header: '.container',
      });
      expect(blocks[1]).toMatchObject({
        type: 'css_media',
        name: '(min-width: 768px)',
        startLine: 5,
        endLine: 9,
        header: '@media (min-width: 768px)',
      });
      expect(blocks[2]).toMatchObject({
        type: 'css_rule',
        name: '.container',
        startLine: 6,
        endLine: 8,
      });
    });

    it('returns empty for empty files and files without parseable blocks', () => {
      expect(
        handler.listBlocks({ filePath: '/workspace/styles.css', content: '' })
      ).toEqual([]);
      expect(
        handler.listBlocks({
          filePath: '/workspace/styles.css',
          content: ['color: red;', 'margin: 0;'].join('\n'),
        })
      ).toEqual([]);
    });

    it('handles single-line declarations and keyframes', () => {
      const content = [
        'h1 { color: red; }',
        '@keyframes pulse {',
        '  from { opacity: 0; }',
        '  to { opacity: 1; }',
        '}',
      ].join('\n');
      const blocks = handler.listBlocks({
        filePath: '/workspace/styles.css',
        content,
      });
      expect(blocks[0]).toMatchObject({
        type: 'css_rule',
        name: 'h1',
        startLine: 1,
        endLine: 1,
      });
      expect(blocks.find(block => block.type === 'css_keyframes')?.name).toBe(
        'pulse'
      );
    });
  });

  describe('findBlockAtLine', () => {
    it('returns innermost block and null in gaps', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/styles.css',
          content: cssContent,
          line: 7,
        })?.startLine
      ).toBe(6);
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/styles.css',
          content: cssContent,
          line: 4,
        })
      ).toBeNull();
    });

    it('treats non-positive lines as line 1', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/styles.css',
          content: cssContent,
          line: 0,
        })?.startLine
      ).toBe(1);
    });
  });

  describe('findNearestBlock', () => {
    it('returns first before file, previous in gap, and last after file', () => {
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/styles.css',
          content: cssContent,
          line: 1,
        })?.startLine
      ).toBe(1);
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/styles.css',
          content: cssContent,
          line: 4,
        })?.startLine
      ).toBe(1);
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/styles.css',
          content: cssContent,
          line: 99,
        })?.startLine
      ).toBe(6);
    });
  });

  describe('resolveDiagnosticAnchorLine', () => {
    const anchorContent = [
      '.container {',
      '  color: red;',
      '}',
      '',
      '/* trailing comment */',
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

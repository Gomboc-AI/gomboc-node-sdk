import { HtmlLanguageHandler } from './handler';

const htmlContent = [
  '<html>',
  '<body>',
  '<div>',
  '<p>Hello</p>',
  '</div>',
  '</body>',
  '</html>',
].join('\n');

describe('HtmlLanguageHandler', () => {
  const handler = new HtmlLanguageHandler();

  describe('detectLanguage', () => {
    it('detects html extensions and rejects non-html files', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/index.html',
          content: htmlContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/index.htm',
          content: htmlContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/index.md',
          content: htmlContent,
        })
      ).toBe(false);
    });

    it('is extension-case insensitive', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/INDEX.HTML',
          content: htmlContent,
        })
      ).toBe(true);
    });
  });

  describe('getDocumentInfo', () => {
    it('returns html document metadata', () => {
      expect(
        handler.getDocumentInfo({
          filePath: '/workspace/index.html',
          content: htmlContent,
        })
      ).toMatchObject({
        languageId: 'html',
        fileName: 'index.html',
        extension: '.html',
        supportsBlocks: true,
        isConfigLike: false,
      });
    });
  });

  describe('listBlocks', () => {
    it('parses nested html elements', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/index.html',
        content: htmlContent,
      });
      expect(blocks.find(block => block.name === 'html')).toBeDefined();
      expect(blocks.find(block => block.name === 'body')).toBeDefined();
      expect(blocks.find(block => block.name === 'div')).toBeDefined();
      expect(blocks.find(block => block.name === 'p')).toBeDefined();
    });

    it('returns empty for empty or tagless files', () => {
      expect(
        handler.listBlocks({ filePath: '/workspace/index.html', content: '' })
      ).toEqual([]);
      expect(
        handler.listBlocks({
          filePath: '/workspace/index.html',
          content: 'plain text',
        })
      ).toEqual([]);
    });
  });

  describe('findBlockAtLine', () => {
    it('returns innermost containing block and null in gaps', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/index.html',
          content: htmlContent,
          line: 4,
        })?.name
      ).toBe('p');
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/index.html',
          content: htmlContent,
          line: 8,
        })
      ).toBeNull();
    });

    it('treats non-positive lines as line 1', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/index.html',
          content: htmlContent,
          line: 0,
        })?.name
      ).toBe('html');
    });
  });

  describe('findNearestBlock', () => {
    it('returns first, previous, and last as expected', () => {
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/index.html',
          content: htmlContent,
          line: 1,
        })?.name
      ).toBe('html');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/index.html',
          content: htmlContent,
          line: 8,
        })?.name
      ).toBe('p');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/index.html',
          content: htmlContent,
          line: 99,
        })?.name
      ).toBe('p');
    });
  });

  describe('resolveDiagnosticAnchorLine', () => {
    const anchorContent = [
      '<div>',
      '  <p>Hello</p>',
      '</div>',
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

import { MarkdownLanguageHandler } from './handler';

const markdownContent = [
  '# Title',
  '',
  'Some intro text.',
  '',
  '## Usage',
  '```ts',
  'console.log("hello");',
  '```',
  'More text.',
].join('\n');

describe('MarkdownLanguageHandler', () => {
  const handler = new MarkdownLanguageHandler();

  describe('detectLanguage', () => {
    it('detects markdown extensions and rejects non-markdown files', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/README.md',
          content: markdownContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/guide.markdown',
          content: markdownContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/guide.txt',
          content: markdownContent,
        })
      ).toBe(false);
    });

    it('is extension-case insensitive', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/README.MD',
          content: markdownContent,
        })
      ).toBe(true);
    });
  });

  describe('getDocumentInfo', () => {
    it('returns markdown document metadata', () => {
      expect(
        handler.getDocumentInfo({
          filePath: '/workspace/README.md',
          content: markdownContent,
        })
      ).toMatchObject({
        languageId: 'markdown',
        fileName: 'README.md',
        extension: '.md',
        supportsBlocks: true,
        isConfigLike: false,
      });
    });
  });

  describe('listBlocks', () => {
    it('parses headings and fenced code blocks', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/README.md',
        content: markdownContent,
      });
      expect(
        blocks.find(
          block => block.type === 'markdown_h1' && block.name === 'Title'
        )
      ).toBeDefined();
      expect(
        blocks.find(
          block => block.type === 'markdown_h2' && block.name === 'Usage'
        )
      ).toBeDefined();
      expect(
        blocks.find(
          block =>
            block.type === 'markdown_fence' &&
            block.name === 'ts' &&
            block.startLine === 6 &&
            block.endLine === 8
        )
      ).toBeDefined();
    });

    it('handles multiple fences and unclosed fence ranges', () => {
      const content = [
        '## A',
        '```bash',
        'echo ok',
        '```',
        '```',
        'left open',
      ].join('\n');
      const blocks = handler.listBlocks({
        filePath: '/workspace/README.md',
        content,
      });
      expect(
        blocks.filter(block => block.type === 'markdown_fence')
      ).toHaveLength(2);
      expect(
        blocks.filter(block => block.type === 'markdown_fence')[1].endLine
      ).toBe(content.split('\n').length);
    });

    it('returns empty for empty files and files without markdown blocks', () => {
      expect(
        handler.listBlocks({ filePath: '/workspace/README.md', content: '' })
      ).toEqual([]);
      expect(
        handler.listBlocks({
          filePath: '/workspace/README.md',
          content: ['plain text', 'still plain'].join('\n'),
        })
      ).toEqual([]);
    });
  });

  describe('findBlockAtLine', () => {
    it('returns innermost block and null when no block exists', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/README.md',
          content: markdownContent,
          line: 7,
        })?.type
      ).toBe('markdown_fence');
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/README.md',
          content: ['plain text only'].join('\n'),
          line: 1,
        })
      ).toBeNull();
    });

    it('treats non-positive lines as line 1', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/README.md',
          content: markdownContent,
          line: 0,
        })?.name
      ).toBe('Title');
    });
  });

  describe('findNearestBlock', () => {
    it('returns first before file, previous in gaps, and last after file', () => {
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/README.md',
          content: markdownContent,
          line: 1,
        })?.name
      ).toBe('Title');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/README.md',
          content: markdownContent,
          line: 4,
        })?.name
      ).toBe('Title');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/README.md',
          content: markdownContent,
          line: 999,
        })?.name
      ).toBe('ts');
    });
  });

  describe('resolveDiagnosticAnchorLine', () => {
    const anchorContent = [
      'Section',
      '  detail line',
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

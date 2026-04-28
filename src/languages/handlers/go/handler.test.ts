import { GoLanguageHandler } from './handler';

const goContent = [
  'package main',
  '',
  'type Service struct {',
  '  name string',
  '}',
  '',
  'func (s *Service) Run() error {',
  '  return nil',
  '}',
  '',
  'func helper() int {',
  '  return 1',
  '}',
].join('\n');

describe('GoLanguageHandler', () => {
  const handler = new GoLanguageHandler();

  describe('detectLanguage', () => {
    it('detects go extensions and ignores non-go extensions', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/main.go',
          content: goContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/main.rs',
          content: goContent,
        })
      ).toBe(false);
    });

    it('is extension-case insensitive', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/MAIN.GO',
          content: goContent,
        })
      ).toBe(true);
    });
  });

  describe('getDocumentInfo', () => {
    it('returns go document metadata', () => {
      expect(
        handler.getDocumentInfo({
          filePath: '/workspace/main.go',
          content: goContent,
        })
      ).toMatchObject({
        languageId: 'go',
        fileName: 'main.go',
        extension: '.go',
        supportsBlocks: true,
        isConfigLike: false,
      });
    });
  });

  describe('listBlocks', () => {
    it('parses type and function blocks with expected ranges', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/main.go',
        content: goContent,
      });
      expect(blocks).toHaveLength(3);
      expect(blocks[0]).toMatchObject({
        type: 'go_struct',
        name: 'Service',
        startLine: 3,
        endLine: 5,
        header: 'type Service struct',
      });
      expect(blocks[1]).toMatchObject({
        type: 'go_function',
        name: 'Run',
        startLine: 7,
        endLine: 9,
      });
      expect(blocks[2]).toMatchObject({
        type: 'go_function',
        name: 'helper',
        startLine: 11,
        endLine: 13,
      });
    });

    it('returns empty for empty files and files without parseable blocks', () => {
      expect(
        handler.listBlocks({ filePath: '/workspace/main.go', content: '' })
      ).toEqual([]);
      expect(
        handler.listBlocks({
          filePath: '/workspace/main.go',
          content: ['package main', 'var x = 1'].join('\n'),
        })
      ).toEqual([]);
    });

    it('ignores control-flow blocks that resemble functions', () => {
      const content = [
        'func run() {',
        '  if true {',
        '    return',
        '  }',
        '}',
      ].join('\n');
      const blocks = handler.listBlocks({
        filePath: '/workspace/main.go',
        content,
      });
      expect(blocks).toHaveLength(1);
      expect(blocks[0].name).toBe('run');
    });
  });

  describe('findBlockAtLine', () => {
    it('returns containing block boundaries and null in gaps', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/main.go',
          content: goContent,
          line: 3,
        })?.name
      ).toBe('Service');
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/main.go',
          content: goContent,
          line: 8,
        })?.name
      ).toBe('Run');
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/main.go',
          content: goContent,
          line: 10,
        })
      ).toBeNull();
    });

    it('treats non-positive lines as line 1', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/main.go',
          content: goContent,
          line: 0,
        })
      ).toBeNull();
    });
  });

  describe('findNearestBlock', () => {
    it('returns first before file, previous in gap, and last after file', () => {
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/main.go',
          content: goContent,
          line: 1,
        })?.name
      ).toBe('Service');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/main.go',
          content: goContent,
          line: 10,
        })?.name
      ).toBe('Run');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/main.go',
          content: goContent,
          line: 99,
        })?.name
      ).toBe('helper');
    });
  });

  describe('resolveDiagnosticAnchorLine', () => {
    const anchorContent = [
      'func run() {',
      '  return',
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

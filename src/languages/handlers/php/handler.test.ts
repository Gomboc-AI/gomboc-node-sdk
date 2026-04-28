import { PhpLanguageHandler } from './handler';

const phpContent = [
  '<?php',
  'class Service {',
  '  public function run(): bool {',
  '    return true;',
  '  }',
  '}',
  '',
  'function helper(): int {',
  '  return 1;',
  '}',
].join('\n');

describe('PhpLanguageHandler', () => {
  const handler = new PhpLanguageHandler();

  describe('detectLanguage', () => {
    it('detects php extensions and rejects non-php extensions', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/index.php',
          content: phpContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/index.phtml',
          content: phpContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/index.ts',
          content: 'console.log("hello");',
        })
      ).toBe(false);
    });

    it('detects php by tag and is extension-case insensitive', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/INDEX.PHP',
          content: phpContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/index',
          content: '<?php echo "ok";',
        })
      ).toBe(true);
    });
  });

  describe('getDocumentInfo', () => {
    it('returns php document metadata', () => {
      expect(
        handler.getDocumentInfo({
          filePath: '/workspace/index.php',
          content: phpContent,
        })
      ).toMatchObject({
        languageId: 'php',
        fileName: 'index.php',
        extension: '.php',
        supportsBlocks: true,
        isConfigLike: false,
      });
    });
  });

  describe('listBlocks', () => {
    it('parses class and function blocks with expected metadata', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/index.php',
        content: phpContent,
      });
      expect(blocks).toHaveLength(3);
      expect(blocks[0]).toMatchObject({
        type: 'php_class',
        name: 'Service',
        startLine: 2,
        endLine: 6,
      });
      expect(blocks[1]).toMatchObject({
        type: 'php_function',
        name: 'run',
        startLine: 3,
        endLine: 5,
      });
      expect(blocks[2]).toMatchObject({
        type: 'php_function',
        name: 'helper',
        startLine: 8,
        endLine: 10,
      });
    });

    it('parses interface and trait blocks and ignores control keywords', () => {
      const content = [
        '<?php',
        'interface Runner {',
        '  public function run(): void {',
        '    if (true) {',
        '      return;',
        '    }',
        '  }',
        '}',
        'trait Util {',
        '  public function make(): int {',
        '    return 1;',
        '  }',
        '}',
      ].join('\n');
      const blocks = handler.listBlocks({
        filePath: '/workspace/index.php',
        content,
      });
      expect(blocks.find(block => block.type === 'php_interface')?.name).toBe(
        'Runner'
      );
      expect(blocks.find(block => block.type === 'php_trait')?.name).toBe(
        'Util'
      );
      expect(blocks.find(block => block.name === 'if')).toBeUndefined();
    });

    it('returns empty for empty files and files without parseable blocks', () => {
      expect(
        handler.listBlocks({ filePath: '/workspace/index.php', content: '' })
      ).toEqual([]);
      expect(
        handler.listBlocks({
          filePath: '/workspace/index.php',
          content: ['<?php', '$x = 1;'].join('\n'),
        })
      ).toEqual([]);
    });
  });

  describe('findBlockAtLine', () => {
    it('returns innermost block and null in gaps', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/index.php',
          content: phpContent,
          line: 4,
        })?.name
      ).toBe('run');
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/index.php',
          content: phpContent,
          line: 7,
        })
      ).toBeNull();
    });

    it('treats non-positive lines as line 1', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/index.php',
          content: phpContent,
          line: 0,
        })
      ).toBeNull();
    });
  });

  describe('findNearestBlock', () => {
    it('returns first, previous, and last as expected', () => {
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/index.php',
          content: phpContent,
          line: 1,
        })?.name
      ).toBe('Service');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/index.php',
          content: phpContent,
          line: 7,
        })?.name
      ).toBe('run');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/index.php',
          content: phpContent,
          line: 999,
        })?.name
      ).toBe('helper');
    });
  });

  describe('resolveDiagnosticAnchorLine', () => {
    const anchorContent = [
      'class Service {',
      '  public function run(): bool {',
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

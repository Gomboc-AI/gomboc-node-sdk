import { RustLanguageHandler } from './handler';

const rustContent = [
  'struct Service {',
  '  enabled: bool,',
  '}',
  '',
  'impl Service {',
  '  fn run(&self) -> bool {',
  '    true',
  '  }',
  '}',
  '',
  'fn helper() -> i32 {',
  '  1',
  '}',
].join('\n');

describe('RustLanguageHandler', () => {
  const handler = new RustLanguageHandler();

  describe('detectLanguage', () => {
    it('detects rust extensions and rejects non-rust files', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/main.rs',
          content: rustContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/main.go',
          content: rustContent,
        })
      ).toBe(false);
    });

    it('is extension-case insensitive', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/MAIN.RS',
          content: rustContent,
        })
      ).toBe(true);
    });
  });

  describe('getDocumentInfo', () => {
    it('returns rust document metadata', () => {
      expect(
        handler.getDocumentInfo({
          filePath: '/workspace/main.rs',
          content: rustContent,
        })
      ).toMatchObject({
        languageId: 'rust',
        fileName: 'main.rs',
        extension: '.rs',
        supportsBlocks: true,
        isConfigLike: false,
      });
    });
  });

  describe('listBlocks', () => {
    it('parses struct, impl, and function blocks', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/main.rs',
        content: rustContent,
      });
      expect(blocks.find(block => block.type === 'rust_struct')?.name).toBe(
        'Service'
      );
      expect(blocks.find(block => block.type === 'rust_impl')?.name).toBe(
        'Service'
      );
      expect(
        blocks.find(
          block => block.type === 'rust_function' && block.name === 'run'
        )
      ).toBeDefined();
      expect(
        blocks.find(
          block => block.type === 'rust_function' && block.name === 'helper'
        )
      ).toBeDefined();
    });

    it('parses enum and trait blocks', () => {
      const content = [
        'enum Role {',
        '  Admin,',
        '}',
        'trait Runner {',
        '  fn run(&self) {',
        '  }',
        '}',
      ].join('\n');
      const blocks = handler.listBlocks({
        filePath: '/workspace/main.rs',
        content,
      });
      expect(blocks.find(block => block.type === 'rust_enum')?.name).toBe(
        'Role'
      );
      expect(blocks.find(block => block.type === 'rust_trait')?.name).toBe(
        'Runner'
      );
    });

    it('returns empty for empty files and files without parseable blocks', () => {
      expect(
        handler.listBlocks({ filePath: '/workspace/main.rs', content: '' })
      ).toEqual([]);
      expect(
        handler.listBlocks({
          filePath: '/workspace/main.rs',
          content: ['let x = 1;', 'let y = x + 1;'].join('\n'),
        })
      ).toEqual([]);
    });
  });

  describe('findBlockAtLine', () => {
    it('returns innermost block and null in gaps', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/main.rs',
          content: rustContent,
          line: 7,
        })?.name
      ).toBe('run');
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/main.rs',
          content: rustContent,
          line: 10,
        })
      ).toBeNull();
    });

    it('treats non-positive lines as line 1', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/main.rs',
          content: rustContent,
          line: 0,
        })?.name
      ).toBe('Service');
    });
  });

  describe('findNearestBlock', () => {
    it('returns first, previous, and last as expected', () => {
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/main.rs',
          content: rustContent,
          line: 1,
        })?.name
      ).toBe('Service');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/main.rs',
          content: rustContent,
          line: 10,
        })?.name
      ).toBe('run');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/main.rs',
          content: rustContent,
          line: 999,
        })?.name
      ).toBe('helper');
    });
  });

  describe('resolveDiagnosticAnchorLine', () => {
    const anchorContent = [
      'fn run() {',
      '  true',
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

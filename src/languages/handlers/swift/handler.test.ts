import { SwiftLanguageHandler } from './handler';

const swiftContent = [
  'class Service {',
  '  func run() -> Bool {',
  '    return true',
  '  }',
  '}',
  '',
  'struct Config {',
  '  let enabled: Bool',
  '}',
].join('\n');

describe('SwiftLanguageHandler', () => {
  const handler = new SwiftLanguageHandler();

  describe('detectLanguage', () => {
    it('detects swift extensions and rejects non-swift files', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/main.swift',
          content: swiftContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/MAIN.SWIFT',
          content: swiftContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/main.kt',
          content: swiftContent,
        })
      ).toBe(false);
    });
  });

  describe('getDocumentInfo', () => {
    it('returns swift document metadata', () => {
      expect(
        handler.getDocumentInfo({
          filePath: '/workspace/main.swift',
          content: swiftContent,
        })
      ).toMatchObject({
        languageId: 'swift',
        fileName: 'main.swift',
        extension: '.swift',
        supportsBlocks: true,
        isConfigLike: false,
      });
    });
  });

  describe('listBlocks', () => {
    it('parses class/struct and function blocks', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/main.swift',
        content: swiftContent,
      });
      expect(blocks.find(block => block.type === 'swift_class')?.name).toBe(
        'Service'
      );
      expect(blocks.find(block => block.type === 'swift_struct')?.name).toBe(
        'Config'
      );
      expect(blocks.find(block => block.type === 'swift_func')?.name).toBe(
        'run'
      );
    });

    it('parses enums/protocols/extensions and empty files gracefully', () => {
      const content = [
        'enum Mode {',
        '  case fast',
        '}',
        '',
        'protocol Runnable {',
        '  func run()',
        '}',
        '',
        'extension String {',
        '  func trimmed() -> String {',
        '    self',
        '  }',
        '}',
      ].join('\n');
      const blocks = handler.listBlocks({
        filePath: '/workspace/main.swift',
        content,
      });
      expect(blocks.find(block => block.type === 'swift_enum')?.name).toBe(
        'Mode'
      );
      expect(blocks.find(block => block.type === 'swift_protocol')?.name).toBe(
        'Runnable'
      );
      expect(blocks.find(block => block.type === 'swift_extension')?.name).toBe(
        'String'
      );
      expect(
        handler.listBlocks({ filePath: '/workspace/main.swift', content: '' })
      ).toEqual([]);
    });
  });

  describe('findBlockAtLine', () => {
    it('returns innermost block and null in gaps', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/main.swift',
          content: swiftContent,
          line: 3,
        })?.name
      ).toBe('run');
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/main.swift',
          content: swiftContent,
          line: 6,
        })
      ).toBeNull();
    });

    it('treats non-positive lines as line 1', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/main.swift',
          content: swiftContent,
          line: 0,
        })?.name
      ).toBe('Service');
    });
  });

  describe('findNearestBlock', () => {
    it('returns first, previous, and last as expected', () => {
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/main.swift',
          content: swiftContent,
          line: 1,
        })?.name
      ).toBe('Service');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/main.swift',
          content: swiftContent,
          line: 6,
        })?.name
      ).toBe('run');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/main.swift',
          content: swiftContent,
          line: 999,
        })?.name
      ).toBe('Config');
    });
  });

  describe('resolveDiagnosticAnchorLine', () => {
    const anchorContent = [
      'class Service {',
      '  func run() {',
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

import { ScalaLanguageHandler } from './handler';

const scalaContent = [
  'object Service {',
  '  def run(): Boolean = {',
  '    true',
  '  }',
  '}',
  '',
  'class Helper {',
  '  def value(): Int = {',
  '    1',
  '  }',
  '}',
].join('\n');

describe('ScalaLanguageHandler', () => {
  const handler = new ScalaLanguageHandler();

  describe('detectLanguage', () => {
    it('detects scala extensions and rejects non-scala files', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/Main.scala',
          content: scalaContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/script.sc',
          content: scalaContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/Main.java',
          content: scalaContent,
        })
      ).toBe(false);
    });

    it('is extension-case insensitive', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/MAIN.SCALA',
          content: scalaContent,
        })
      ).toBe(true);
    });
  });

  describe('getDocumentInfo', () => {
    it('returns scala document metadata', () => {
      expect(
        handler.getDocumentInfo({
          filePath: '/workspace/Main.scala',
          content: scalaContent,
        })
      ).toMatchObject({
        languageId: 'scala',
        fileName: 'Main.scala',
        extension: '.scala',
        supportsBlocks: true,
        isConfigLike: false,
      });
    });
  });

  describe('listBlocks', () => {
    it('parses object/class and def blocks with expected metadata', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/Main.scala',
        content: scalaContent,
      });
      expect(blocks.find(block => block.type === 'scala_object')?.name).toBe(
        'Service'
      );
      expect(blocks.find(block => block.type === 'scala_class')?.name).toBe(
        'Helper'
      );
      expect(
        blocks
          .filter(block => block.type === 'scala_def')
          .map(block => block.name)
      ).toEqual(['run', 'value']);
    });

    it('parses trait blocks and generic defs', () => {
      const content = [
        'trait Runner {',
        '  def run[A](a: A): A = {',
        '    a',
        '  }',
        '}',
      ].join('\n');
      const blocks = handler.listBlocks({
        filePath: '/workspace/Main.scala',
        content,
      });
      expect(blocks.find(block => block.type === 'scala_trait')?.name).toBe(
        'Runner'
      );
      expect(blocks.find(block => block.type === 'scala_def')?.name).toBe(
        'run'
      );
    });

    it('returns empty for empty files and files without parseable blocks', () => {
      expect(
        handler.listBlocks({ filePath: '/workspace/Main.scala', content: '' })
      ).toEqual([]);
      expect(
        handler.listBlocks({
          filePath: '/workspace/Main.scala',
          content: ['val x = 1', 'println(x)'].join('\n'),
        })
      ).toEqual([]);
    });
  });

  describe('findBlockAtLine', () => {
    it('returns innermost block and null in gaps', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/Main.scala',
          content: scalaContent,
          line: 3,
        })?.name
      ).toBe('run');
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/Main.scala',
          content: scalaContent,
          line: 6,
        })
      ).toBeNull();
    });

    it('treats non-positive lines as line 1', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/Main.scala',
          content: scalaContent,
          line: 0,
        })?.name
      ).toBe('Service');
    });
  });

  describe('findNearestBlock', () => {
    it('returns first, previous, and last as expected', () => {
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/Main.scala',
          content: scalaContent,
          line: 1,
        })?.name
      ).toBe('Service');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/Main.scala',
          content: scalaContent,
          line: 6,
        })?.name
      ).toBe('run');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/Main.scala',
          content: scalaContent,
          line: 999,
        })?.name
      ).toBe('value');
    });
  });

  describe('resolveDiagnosticAnchorLine', () => {
    const anchorContent = [
      'object Service {',
      '  def run(): Boolean = {',
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

import { GroovyLanguageHandler } from './handler';

const groovyContent = [
  'class Service {',
  '  def run() {',
  '    return true',
  '  }',
  '}',
  '',
  'trait Worker {',
  '  String name() {',
  '    "worker"',
  '  }',
  '}',
].join('\n');

describe('GroovyLanguageHandler', () => {
  const handler = new GroovyLanguageHandler();

  describe('detectLanguage', () => {
    it('detects groovy extensions and ignores non-groovy extensions', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/app.groovy',
          content: groovyContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/script.gsh',
          content: groovyContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/app.gradle',
          content: groovyContent,
        })
      ).toBe(false);
    });

    it('is extension-case insensitive', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/APP.GROOVY',
          content: groovyContent,
        })
      ).toBe(true);
    });
  });

  describe('getDocumentInfo', () => {
    it('returns groovy document metadata', () => {
      expect(
        handler.getDocumentInfo({
          filePath: '/workspace/app.groovy',
          content: groovyContent,
        })
      ).toMatchObject({
        languageId: 'groovy',
        fileName: 'app.groovy',
        extension: '.groovy',
        supportsBlocks: true,
        isConfigLike: false,
      });
    });
  });

  describe('listBlocks', () => {
    it('parses class/trait and method blocks with expected ranges', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/app.groovy',
        content: groovyContent,
      });
      expect(blocks).toHaveLength(4);
      expect(blocks[0]).toMatchObject({
        type: 'groovy_class',
        name: 'Service',
        startLine: 1,
        endLine: 5,
      });
      expect(blocks[1]).toMatchObject({
        type: 'groovy_method',
        name: 'run',
        startLine: 2,
        endLine: 4,
      });
      expect(blocks[2]).toMatchObject({
        type: 'groovy_trait',
        name: 'Worker',
        startLine: 7,
        endLine: 11,
      });
      expect(blocks[3]).toMatchObject({
        type: 'groovy_method',
        name: 'name',
        startLine: 8,
        endLine: 10,
      });
    });

    it('returns empty for empty files and files without parseable blocks', () => {
      expect(
        handler.listBlocks({ filePath: '/workspace/app.groovy', content: '' })
      ).toEqual([]);
      expect(
        handler.listBlocks({
          filePath: '/workspace/app.groovy',
          content: ['println "hello"', 'def x = 1'].join('\n'),
        })
      ).toEqual([]);
    });

    it('ignores control-flow declarations that resemble methods', () => {
      const content = [
        'class Service {',
        '  def run() {',
        '    if (true) {',
        '      return',
        '    }',
        '  }',
        '}',
      ].join('\n');
      const blocks = handler.listBlocks({
        filePath: '/workspace/app.groovy',
        content,
      });
      expect(
        blocks.filter(block => block.type === 'groovy_method').map(b => b.name)
      ).toEqual(['run']);
    });
  });

  describe('findBlockAtLine', () => {
    it('returns innermost block and null in gaps', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/app.groovy',
          content: groovyContent,
          line: 3,
        })?.name
      ).toBe('run');
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/app.groovy',
          content: groovyContent,
          line: 6,
        })
      ).toBeNull();
    });

    it('treats non-positive lines as line 1', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/app.groovy',
          content: groovyContent,
          line: 0,
        })?.name
      ).toBe('Service');
    });
  });

  describe('findNearestBlock', () => {
    it('returns first before file, previous in gap, and last after file', () => {
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/app.groovy',
          content: groovyContent,
          line: 1,
        })?.name
      ).toBe('Service');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/app.groovy',
          content: groovyContent,
          line: 6,
        })?.name
      ).toBe('run');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/app.groovy',
          content: groovyContent,
          line: 99,
        })?.name
      ).toBe('name');
    });
  });

  describe('resolveDiagnosticAnchorLine', () => {
    const anchorContent = [
      'class Service {',
      '  def run() {',
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

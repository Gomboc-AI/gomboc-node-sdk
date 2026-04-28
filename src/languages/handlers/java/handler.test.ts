import { JavaLanguageHandler } from './handler';

const javaContent = [
  'public class App {',
  '  private String name;',
  '',
  '  public App(String name) {',
  '    this.name = name;',
  '  }',
  '',
  '  public String getName() {',
  '    return name;',
  '  }',
  '}',
].join('\n');

describe('JavaLanguageHandler', () => {
  const handler = new JavaLanguageHandler();

  it('detects .java files and ignores non-java extensions', () => {
    expect(
      handler.detectLanguage({
        filePath: '/workspace/src/App.java',
        content: javaContent,
      })
    ).toBe(true);
    expect(
      handler.detectLanguage({
        filePath: '/workspace/src/App.kt',
        content: javaContent,
      })
    ).toBe(false);
  });

  it('returns java document info metadata', () => {
    expect(
      handler.getDocumentInfo({
        filePath: '/workspace/src/App.java',
        content: javaContent,
      })
    ).toMatchObject({
      languageId: 'java',
      fileName: 'App.java',
      extension: '.java',
      supportsBlocks: true,
    });
  });

  describe('resolveDiagnosticAnchorLine', () => {
    const anchorContent = [
      'public class App {',
      '  private String name;',
      '}',
      '',
      '// trailing',
    ].join('\n');

    it('keeps fix operations on suggested line and character', () => {
      expect(
        handler.resolveDiagnosticAnchorLine({
          content: anchorContent,
          suggestedLine: 2,
          fromFixOperation: true,
        })
      ).toEqual({ line: 2, character: 2 });
    });

    it('clamps fix operations above max line', () => {
      expect(
        handler.resolveDiagnosticAnchorLine({
          content: anchorContent,
          suggestedLine: 999,
          fromFixOperation: true,
        })
      ).toEqual({ line: 5, character: 0 });
    });

    it('anchors add/no-op from weak lines to nearest meaningful line above', () => {
      expect(
        handler.resolveDiagnosticAnchorLine({
          content: anchorContent,
          suggestedLine: 3,
          fromFixOperation: false,
        })
      ).toEqual({ line: 2, character: 2 });
    });

    it('normalizes invalid suggested lines', () => {
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

  describe('listBlocks', () => {
    it('parses classes and methods', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/src/App.java',
        content: javaContent,
      });
      expect(blocks.find(block => block.type === 'java_class')?.name).toBe(
        'App'
      );
      expect(
        blocks.some(
          block => block.type === 'java_method' && block.name === 'getName'
        )
      ).toBe(true);
    });

    it('returns empty for empty content', () => {
      expect(
        handler.listBlocks({ filePath: '/workspace/src/App.java', content: '' })
      ).toEqual([]);
    });

    it('includes class block when no methods exist', () => {
      const content = ['public class Empty {', '}'].join('\n');
      const blocks = handler.listBlocks({
        filePath: '/workspace/src/Empty.java',
        content,
      });
      expect(blocks.find(block => block.type === 'java_class')?.name).toBe(
        'Empty'
      );
    });

    it('captures outer and inner classes with inner methods', () => {
      const content = [
        'public class Outer {',
        '  class Inner {',
        '    void work() {',
        '    }',
        '  }',
        '}',
      ].join('\n');
      const blocks = handler.listBlocks({
        filePath: '/workspace/src/Outer.java',
        content,
      });
      expect(
        blocks.find(
          block => block.type === 'java_class' && block.name === 'Outer'
        )
      ).toBeDefined();
      expect(
        blocks.find(
          block => block.type === 'java_class' && block.name === 'Inner'
        )
      ).toBeDefined();
      expect(
        blocks.find(
          block => block.type === 'java_method' && block.name === 'work'
        )
      ).toBeDefined();
    });

    it('does not parse abstract method declarations without braces as blocks', () => {
      const content = [
        'public abstract class Base {',
        '  public abstract void run();',
        '}',
      ].join('\n');
      const blocks = handler.listBlocks({
        filePath: '/workspace/src/Base.java',
        content,
      });
      expect(
        blocks.find(
          block => block.type === 'java_method' && block.name === 'run'
        )
      ).toBeUndefined();
    });

    it('parses interfaces as java_interface blocks', () => {
      const content = ['public interface Service {', '  void run();', '}'].join(
        '\n'
      );
      const blocks = handler.listBlocks({
        filePath: '/workspace/src/Service.java',
        content,
      });
      expect(blocks.find(block => block.type === 'java_interface')?.name).toBe(
        'Service'
      );
    });

    it('ignores control-flow keywords when parsing methods', () => {
      const content = [
        'public class Svc {',
        '  public void run() {',
        '    if (true) {',
        '      for (int i = 0; i < 10; i++) {',
        '        while (cond) {',
        '        }',
        '      }',
        '    }',
        '  }',
        '}',
      ].join('\n');
      const blocks = handler.listBlocks({
        filePath: '/workspace/src/Svc.java',
        content,
      });
      expect(blocks.filter(block => block.type === 'java_class')).toHaveLength(
        1
      );
      expect(blocks.filter(block => block.type === 'java_method')).toHaveLength(
        1
      );
      expect(blocks.find(block => block.name === 'if')).toBeUndefined();
      expect(blocks.find(block => block.name === 'for')).toBeUndefined();
      expect(blocks.find(block => block.name === 'while')).toBeUndefined();
    });
  });

  describe('findBlockAtLine and findNearestBlock', () => {
    it('returns innermost block for nested method lines', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/src/App.java',
          content: javaContent,
          line: 9,
        })?.name
      ).toBe('getName');
    });

    it('returns class on class header and method on method signature', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/src/App.java',
          content: javaContent,
          line: 1,
        })?.type
      ).toBe('java_class');
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/src/App.java',
          content: javaContent,
          line: 8,
        })?.type
      ).toBe('java_method');
    });

    it('returns nearest block for out-of-range lines', () => {
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/src/App.java',
          content: javaContent,
          line: 99,
        })?.name
      ).toBe('getName');
    });
  });

  describe('buildDiagnosticRange', () => {
    it('returns compact range anchored at first non-whitespace', () => {
      const line = '  bucket = "logs"';
      const result = handler.buildDiagnosticRange({
        line1Based: 1,
        content: line,
      });
      expect(result.startChar).toBe(2);
      expect(result.endChar).toBe(2 + Math.min(24, line.trim().length));
    });

    it('caps long lines and handles short/empty/whitespace lines', () => {
      const longLine =
        '  this_is_a_very_long_identifier_that_exceeds_24_chars = true';
      const shortLine = '  ok';
      expect(
        handler.buildDiagnosticRange({ line1Based: 1, content: longLine })
          .endChar -
          handler.buildDiagnosticRange({ line1Based: 1, content: longLine })
            .startChar
      ).toBe(24);
      expect(
        handler.buildDiagnosticRange({ line1Based: 1, content: shortLine })
          .endChar -
          handler.buildDiagnosticRange({ line1Based: 1, content: shortLine })
            .startChar
      ).toBe(shortLine.trim().length);
      expect(
        handler.buildDiagnosticRange({ line1Based: 1, content: '' })
      ).toEqual({
        startChar: 0,
        endChar: 1,
      });
      expect(
        handler.buildDiagnosticRange({ line1Based: 1, content: '   ' })
      ).toEqual({
        startChar: 0,
        endChar: 1,
      });
    });
  });
});

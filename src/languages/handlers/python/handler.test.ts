import { PythonLanguageHandler } from './handler';

const pythonContent = [
  'class Service:',
  '    def __init__(self, name):',
  '        self.name = name',
  '',
  '    def get_name(self):',
  '        return self.name',
  '',
  '',
  'def helper():',
  "    return 'ok'",
].join('\n');

describe('PythonLanguageHandler', () => {
  const handler = new PythonLanguageHandler();

  it('detects .py files and ignores non-python extensions', () => {
    expect(
      handler.detectLanguage({
        filePath: '/workspace/service.py',
        content: pythonContent,
      })
    ).toBe(true);
    expect(
      handler.detectLanguage({
        filePath: '/workspace/service.rb',
        content: pythonContent,
      })
    ).toBe(false);
  });

  it('returns python document info metadata', () => {
    expect(
      handler.getDocumentInfo({
        filePath: '/workspace/service.py',
        content: pythonContent,
      })
    ).toMatchObject({
      languageId: 'python',
      extension: '.py',
      fileName: 'service.py',
      supportsBlocks: true,
    });
  });

  describe('resolveDiagnosticAnchorLine', () => {
    const anchorContent = [
      'class Service:',
      '    def run(self):',
      '        return True',
      '',
      '# trailing comment',
    ].join('\n');

    it('keeps fix operations on suggested line', () => {
      expect(
        handler.resolveDiagnosticAnchorLine({
          content: anchorContent,
          suggestedLine: 2,
          fromFixOperation: true,
        })
      ).toEqual({ line: 2, character: 4 });
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
          suggestedLine: 4,
          fromFixOperation: false,
        })
      ).toEqual({ line: 3, character: 8 });
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
      ).toEqual({ line: 3, character: 8 });
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
    it('parses class/function blocks from primary fixture', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/service.py',
        content: pythonContent,
      });
      expect(blocks.find(block => block.type === 'python_class')?.name).toBe(
        'Service'
      );
      expect(blocks.find(block => block.name === '__init__')).toBeDefined();
      expect(blocks.find(block => block.name === 'get_name')).toBeDefined();
      expect(blocks.find(block => block.name === 'helper')).toBeDefined();
    });

    it('returns empty for empty files and top-level statements only', () => {
      expect(
        handler.listBlocks({ filePath: '/workspace/service.py', content: '' })
      ).toEqual([]);
      expect(
        handler.listBlocks({
          filePath: '/workspace/service.py',
          content: ["print('hello')", 'x = 1'].join('\n'),
        })
      ).toEqual([]);
    });

    it('captures class + methods + nested function blocks', () => {
      const content = [
        'class Service:',
        '    def run(self):',
        '        def nested():',
        "            return 'ok'",
        '        return nested()',
        '',
        'def helper():',
        "    return 'x'",
      ].join('\n');
      const blocks = handler.listBlocks({
        filePath: '/workspace/service.py',
        content,
      });
      expect(blocks.find(block => block.type === 'python_class')).toBeDefined();
      expect(blocks.find(block => block.name === 'run')).toBeDefined();
      expect(blocks.find(block => block.name === 'nested')).toBeDefined();
      expect(blocks.find(block => block.name === 'helper')).toBeDefined();
    });

    it('includes trailing blank lines in function end range', () => {
      const content = ['def helper():', "    return 'ok'", '', ''].join('\n');
      const block = handler.listBlocks({
        filePath: '/workspace/service.py',
        content,
      })[0];
      expect(block.endLine).toBe(4);
    });

    it('keeps top-level function ranges non-overlapping', () => {
      const content = [
        'def first():',
        "    return 'a'",
        '',
        'def second():',
        "    return 'b'",
      ].join('\n');
      const blocks = handler.listBlocks({
        filePath: '/workspace/service.py',
        content,
      });
      expect(blocks).toHaveLength(2);
      expect(blocks[0].endLine).toBeLessThan(blocks[1].startLine);
    });
  });

  describe('findBlockAtLine and findNearestBlock', () => {
    const nestedContent = [
      'class Service:',
      '',
      '    def first(self):',
      '        return 1',
      '',
      '    def second(self):',
      '        return 2',
      '',
      'def helper():',
      "    return 'ok'",
    ].join('\n');

    it('returns containing class/function block for method body lines', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/service.py',
          content: nestedContent,
          line: 4,
        })?.name
      ).toBe('Service');
    });

    it('returns class on class header and null after final block', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/service.py',
          content: nestedContent,
          line: 1,
        })?.name
      ).toBe('Service');
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/service.py',
          content: nestedContent,
          line: 12,
        })
      ).toBeNull();
    });

    it('returns class for blank line inside class body outside methods', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/service.py',
          content: nestedContent,
          line: 2,
        })?.name
      ).toBe('Service');
    });

    it('returns first block before file and last block past file', () => {
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/service.py',
          content: nestedContent,
          line: 0,
        })?.name
      ).toBe('Service');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/service.py',
          content: nestedContent,
          line: 99,
        })?.name
      ).toBe('helper');
    });
  });
});

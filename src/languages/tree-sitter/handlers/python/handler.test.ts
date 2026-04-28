import { TreeSitterPythonLanguageHandler } from './handler';

const simpleFunc = ['def foo():', '    return 1'].join('\n');

const simpleClass = ['class MyClass:', '    pass'].join('\n');

const classWithMethods = [
  'class Service:',
  '    def __init__(self, name):',
  '        self.name = name',
  '',
  '    def get_name(self):',
  '        return self.name',
].join('\n');

const topLevelMix = [
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

const decoratedFunc = [
  '@property',
  'def my_prop(self):',
  '    return self._x',
].join('\n');

const decoratedClass = [
  '@dataclass',
  'class Config:',
  '    host: str',
  '    port: int',
].join('\n');

const stackedDecorators = [
  '@staticmethod',
  '@some_decorator',
  'def util():',
  '    pass',
].join('\n');

const asyncFunc = ['async def fetch():', '    return await something()'].join(
  '\n'
);

const nestedFunc = [
  'def outer():',
  '    def inner():',
  '        pass',
  '    return inner',
].join('\n');

const multilineSignature = [
  'def complex(',
  '    arg1: str,',
  '    arg2: int',
  ') -> bool:',
  '    return True',
].join('\n');

const lambdaOnly = 'x = lambda a: a + 1';

const emptyFile = '';

const commentsOnly = ['# just a comment', '# another comment'].join('\n');

const scriptOnly = ['x = 1', 'y = 2', 'print(x + y)'].join('\n');

const handler = new TreeSitterPythonLanguageHandler();
const filePath = '/tmp/sample.py';

describe('TreeSitterPythonLanguageHandler', () => {
  describe('listBlocks', () => {
    it('finds a simple function block', () => {
      const blocks = handler.listBlocks({ filePath, content: simpleFunc });

      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('python_function');
      expect(blocks[0].name).toBe('foo');
    });

    it('finds a simple class block', () => {
      const blocks = handler.listBlocks({ filePath, content: simpleClass });

      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('python_class');
      expect(blocks[0].name).toBe('MyClass');
    });

    it('finds class and method blocks', () => {
      const blocks = handler.listBlocks({
        filePath,
        content: classWithMethods,
      });

      expect(blocks).toHaveLength(3);
      expect(blocks.map(block => block.name)).toEqual([
        'Service',
        '__init__',
        'get_name',
      ]);
      expect(blocks.map(block => block.type)).toEqual([
        'python_class',
        'python_function',
        'python_function',
      ]);
    });

    it('finds mixed top-level class and function blocks', () => {
      const blocks = handler.listBlocks({ filePath, content: topLevelMix });

      expect(blocks).toHaveLength(4);
      expect(blocks.map(block => block.name)).toEqual([
        'Service',
        '__init__',
        'get_name',
        'helper',
      ]);
    });

    it('finds async function blocks as python_function', () => {
      const blocks = handler.listBlocks({ filePath, content: asyncFunc });

      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('python_function');
      expect(blocks[0].name).toBe('fetch');
    });

    it('deduplicates decorated function captures and anchors to decorator line', () => {
      const blocks = handler.listBlocks({ filePath, content: decoratedFunc });

      expect(blocks).toHaveLength(1);
      expect(blocks[0].name).toBe('my_prop');
      expect(blocks[0].type).toBe('python_function');
      expect(blocks[0].startLine).toBe(1);
    });

    it('maps decorated class to python_class and starts at decorator line', () => {
      const blocks = handler.listBlocks({ filePath, content: decoratedClass });

      expect(blocks).toHaveLength(1);
      expect(blocks[0].name).toBe('Config');
      expect(blocks[0].type).toBe('python_class');
      expect(blocks[0].startLine).toBe(1);
    });

    it('handles stacked decorators as a single block starting at first decorator', () => {
      const blocks = handler.listBlocks({
        filePath,
        content: stackedDecorators,
      });

      expect(blocks).toHaveLength(1);
      expect(blocks[0].name).toBe('util');
      expect(blocks[0].startLine).toBe(1);
    });

    it('does not treat lambdas as blocks', () => {
      const blocks = handler.listBlocks({ filePath, content: lambdaOnly });
      expect(blocks).toEqual([]);
    });

    it('returns no blocks for empty files', () => {
      const blocks = handler.listBlocks({ filePath, content: emptyFile });
      expect(blocks).toEqual([]);
    });

    it('returns no blocks for comment-only files', () => {
      const blocks = handler.listBlocks({ filePath, content: commentsOnly });
      expect(blocks).toEqual([]);
    });

    it('returns no blocks for script-only files', () => {
      const blocks = handler.listBlocks({ filePath, content: scriptOnly });
      expect(blocks).toEqual([]);
    });

    it('handles multiline signatures with body-based end line', () => {
      const blocks = handler.listBlocks({
        filePath,
        content: multilineSignature,
      });

      expect(blocks).toHaveLength(1);
      expect(blocks[0].name).toBe('complex');
      expect(blocks[0].startLine).toBe(1);
      expect(blocks[0].endLine).toBe(5);
    });
  });

  describe('findBlockAtLine', () => {
    it('returns Service when the line is on class declaration', () => {
      const block = handler.findBlockAtLine({
        filePath,
        content: topLevelMix,
        line: 1,
      });
      expect(block?.name).toBe('Service');
    });

    it('returns __init__ for a line inside __init__ body', () => {
      const block = handler.findBlockAtLine({
        filePath,
        content: topLevelMix,
        line: 3,
      });
      expect(block?.name).toBe('__init__');
    });

    it('returns helper on helper declaration line', () => {
      const block = handler.findBlockAtLine({
        filePath,
        content: topLevelMix,
        line: 9,
      });
      expect(block?.name).toBe('helper');
    });

    it('returns helper for a line inside helper body', () => {
      const block = handler.findBlockAtLine({
        filePath,
        content: topLevelMix,
        line: 10,
      });
      expect(block?.name).toBe('helper');
    });

    it('returns null on blank line between class and helper', () => {
      const block = handler.findBlockAtLine({
        filePath,
        content: topLevelMix,
        line: 8,
      });
      expect(block).toBeNull();
    });

    it('handles non-positive lines without throwing', () => {
      expect(() =>
        handler.findBlockAtLine({ filePath, content: topLevelMix, line: 0 })
      ).not.toThrow();
      expect(() =>
        handler.findBlockAtLine({ filePath, content: topLevelMix, line: -2 })
      ).not.toThrow();
      expect(
        handler.findBlockAtLine({ filePath, content: topLevelMix, line: 0 })
      ).toBeNull();
      expect(
        handler.findBlockAtLine({ filePath, content: topLevelMix, line: -2 })
      ).toBeNull();
    });

    it('returns inner when line is inside inner body', () => {
      const block = handler.findBlockAtLine({
        filePath,
        content: nestedFunc,
        line: 3,
      });
      expect(block?.name).toBe('inner');
    });

    it('returns outer when line is inside outer but outside inner', () => {
      const block = handler.findBlockAtLine({
        filePath,
        content: nestedFunc,
        line: 4,
      });
      expect(block?.name).toBe('outer');
    });
  });

  describe('findNearestBlock', () => {
    it('returns helper for line after helper block end', () => {
      const block = handler.findNearestBlock({
        filePath,
        content: topLevelMix,
        line: 11,
      });
      expect(block?.name).toBe('helper');
    });

    it('returns nearest preceding block between class and helper', () => {
      const block = handler.findNearestBlock({
        filePath,
        content: topLevelMix,
        line: 8,
      });
      expect(block?.name).toBe('get_name');
    });

    it('returns null before any block', () => {
      const content = [''].concat(topLevelMix).join('\n');
      const block = handler.findNearestBlock({ filePath, content, line: 1 });
      expect(block).toBeNull();
    });
  });

  describe('resolveDiagnosticAnchorLine', () => {
    it('anchors a line inside __init__ body to the __init__ definition line', () => {
      const anchor = handler.resolveDiagnosticAnchorLine({
        content: classWithMethods,
        suggestedLine: 3,
        fromFixOperation: false,
      });
      expect(anchor).toBe(2);
    });

    it('keeps anchor on __init__ definition when suggested line is already there', () => {
      const anchor = handler.resolveDiagnosticAnchorLine({
        content: classWithMethods,
        suggestedLine: 2,
        fromFixOperation: false,
      });
      expect(anchor).toBe(2);
    });

    it('anchors decorator-region suggestion to decorated definition start', () => {
      const anchor = handler.resolveDiagnosticAnchorLine({
        content: decoratedFunc,
        suggestedLine: 1,
        fromFixOperation: false,
      });
      expect(anchor).toBe(1);
    });

    it('anchors insertion one line past EOF to start line of last node', () => {
      const anchor = handler.resolveDiagnosticAnchorLine({
        content: classWithMethods,
        suggestedLine: 7,
        fromFixOperation: true,
      });
      expect(anchor).toBe(6);
    });

    it('anchors insertion several lines past EOF to same last node start line', () => {
      const anchor = handler.resolveDiagnosticAnchorLine({
        content: classWithMethods,
        suggestedLine: 11,
        fromFixOperation: true,
      });
      expect(anchor).toBe(6);
    });

    it('returns 1 for empty files regardless of suggested line', () => {
      const anchor = handler.resolveDiagnosticAnchorLine({
        content: emptyFile,
        suggestedLine: 123,
        fromFixOperation: false,
      });
      expect(anchor).toBe(1);
    });
  });

  describe('buildDiagnosticRange', () => {
    it('computes range at column 0 for top-level def', () => {
      const range = handler.buildDiagnosticRange({
        line1Based: 1,
        content: simpleFunc,
      });
      expect(range.startChar).toBe(0);
      expect(range.endChar).toBeGreaterThanOrEqual('def foo'.length);
    });

    it('computes range from first non-whitespace character for indented def', () => {
      const range = handler.buildDiagnosticRange({
        line1Based: 2,
        content: classWithMethods,
      });
      expect(range.startChar).toBe(4);
      expect(range.endChar).toBeGreaterThan(range.startChar);
    });

    it('covers class header from column 0', () => {
      const range = handler.buildDiagnosticRange({
        line1Based: 1,
        content: simpleClass,
      });
      expect(range.startChar).toBe(0);
      expect(range.endChar).toBeGreaterThanOrEqual('class MyClass'.length);
    });
  });
});

import { ElixirLanguageHandler } from './handler';

const elixirContent = [
  'defmodule Demo.Service do',
  '  def run(value) do',
  '    value + 1',
  '  end',
  'end',
  '',
  'defmodule Demo.Worker do',
  '  defp helper do',
  '    :ok',
  '  end',
  'end',
].join('\n');

describe('ElixirLanguageHandler', () => {
  const handler = new ElixirLanguageHandler();

  describe('detectLanguage', () => {
    it('detects elixir extensions and ignores non-elixir extensions', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/service.ex',
          content: elixirContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/mix.exs',
          content: elixirContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/service.rb',
          content: elixirContent,
        })
      ).toBe(false);
    });

    it('is extension-case insensitive', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/SERVICE.EX',
          content: elixirContent,
        })
      ).toBe(true);
    });
  });

  describe('getDocumentInfo', () => {
    it('returns elixir document metadata', () => {
      expect(
        handler.getDocumentInfo({
          filePath: '/workspace/service.ex',
          content: elixirContent,
        })
      ).toMatchObject({
        languageId: 'elixir',
        fileName: 'service.ex',
        extension: '.ex',
        supportsBlocks: true,
        isConfigLike: false,
      });
    });
  });

  describe('listBlocks', () => {
    it('parses modules and function blocks with expected ranges', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/service.ex',
        content: elixirContent,
      });
      expect(blocks).toHaveLength(4);
      expect(blocks[0]).toMatchObject({
        type: 'elixir_module',
        name: 'Demo.Service',
        startLine: 1,
        endLine: 5,
        header: 'defmodule Demo.Service',
      });
      expect(blocks[1]).toMatchObject({
        type: 'elixir_function',
        name: 'run',
        startLine: 2,
        endLine: 4,
        header: 'def run',
      });
      expect(blocks[2]).toMatchObject({
        type: 'elixir_module',
        name: 'Demo.Worker',
        startLine: 7,
        endLine: 11,
      });
      expect(blocks[3]).toMatchObject({
        type: 'elixir_function',
        name: 'helper',
        startLine: 8,
        endLine: 10,
      });
    });

    it('returns empty for empty files and files without parseable blocks', () => {
      expect(
        handler.listBlocks({ filePath: '/workspace/service.ex', content: '' })
      ).toEqual([]);
      expect(
        handler.listBlocks({
          filePath: '/workspace/service.ex',
          content: [':ok', 'value = 1'].join('\n'),
        })
      ).toEqual([]);
    });

    it('parses protocol and implementation declarations', () => {
      const content = [
        'defprotocol Size do',
        '  def size(data)',
        'end',
        '',
        'defimpl Size, for: Map do',
        '  def size(data) do',
        '    map_size(data)',
        '  end',
        'end',
      ].join('\n');
      const blocks = handler.listBlocks({
        filePath: '/workspace/size.ex',
        content,
      });
      expect(blocks.find(block => block.type === 'elixir_protocol')?.name).toBe(
        'Size'
      );
      expect(blocks.find(block => block.type === 'elixir_impl')?.name).toBe(
        'Size'
      );
    });
  });

  describe('findBlockAtLine', () => {
    it('returns innermost block and null in gaps', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/service.ex',
          content: elixirContent,
          line: 3,
        })?.name
      ).toBe('run');
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/service.ex',
          content: elixirContent,
          line: 6,
        })
      ).toBeNull();
    });

    it('treats non-positive lines as line 1', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/service.ex',
          content: elixirContent,
          line: 0,
        })?.name
      ).toBe('Demo.Service');
    });
  });

  describe('findNearestBlock', () => {
    it('returns first before file, previous in gap, and last after file', () => {
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/service.ex',
          content: elixirContent,
          line: 1,
        })?.name
      ).toBe('Demo.Service');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/service.ex',
          content: elixirContent,
          line: 6,
        })?.name
      ).toBe('run');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/service.ex',
          content: elixirContent,
          line: 99,
        })?.name
      ).toBe('helper');
    });
  });

  describe('resolveDiagnosticAnchorLine', () => {
    const anchorContent = [
      'defmodule Demo.Service do',
      '  def run do',
      '  end',
      '',
      '# trailing comment',
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

import { RubyLanguageHandler } from './handler';

const rubyContent = [
  'class Service',
  '  def run',
  '    true',
  '  end',
  'end',
  '',
  'def helper',
  '  1',
  'end',
].join('\n');

describe('RubyLanguageHandler', () => {
  const handler = new RubyLanguageHandler();

  describe('detectLanguage', () => {
    it('detects ruby extensions and rejects non-ruby files', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/app.rb',
          content: rubyContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/Rakefile',
          content: rubyContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/app.py',
          content: rubyContent,
        })
      ).toBe(false);
    });

    it('detects ruby via shebang and extension case-insensitively', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/script',
          content: ['#!/usr/bin/env ruby', 'puts "ok"'].join('\n'),
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/APP.RB',
          content: rubyContent,
        })
      ).toBe(true);
    });
  });

  describe('getDocumentInfo', () => {
    it('returns ruby document metadata', () => {
      expect(
        handler.getDocumentInfo({
          filePath: '/workspace/app.rb',
          content: rubyContent,
        })
      ).toMatchObject({
        languageId: 'ruby',
        fileName: 'app.rb',
        extension: '.rb',
        supportsBlocks: true,
        isConfigLike: false,
      });
    });
  });

  describe('listBlocks', () => {
    it('parses class/module/method blocks', () => {
      const content = [
        'module App',
        '  class Service',
        '    def run',
        '      true',
        '    end',
        '  end',
        'end',
      ].join('\n');
      const blocks = handler.listBlocks({
        filePath: '/workspace/app.rb',
        content,
      });
      expect(blocks.find(block => block.type === 'ruby_module')?.name).toBe(
        'App'
      );
      expect(blocks.find(block => block.type === 'ruby_class')?.name).toBe(
        'Service'
      );
      expect(blocks.find(block => block.type === 'ruby_method')?.name).toBe(
        'run'
      );
    });

    it('parses class methods and nested control-flow within defs', () => {
      const content = [
        'class S',
        '  def self.call',
        '    if true',
        '      1',
        '    end',
        '  end',
        'end',
      ].join('\n');
      const blocks = handler.listBlocks({
        filePath: '/workspace/app.rb',
        content,
      });
      expect(
        blocks.find(
          block => block.type === 'ruby_method' && block.name === 'call'
        )
      ).toBeDefined();
    });

    it('returns empty for empty files and files without parseable blocks', () => {
      expect(
        handler.listBlocks({ filePath: '/workspace/app.rb', content: '' })
      ).toEqual([]);
      expect(
        handler.listBlocks({
          filePath: '/workspace/app.rb',
          content: ['puts "hello"', 'x = 1'].join('\n'),
        })
      ).toEqual([]);
    });
  });

  describe('findBlockAtLine', () => {
    it('returns innermost block and null in gaps', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/app.rb',
          content: rubyContent,
          line: 3,
        })?.name
      ).toBe('run');
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/app.rb',
          content: rubyContent,
          line: 6,
        })
      ).toBeNull();
    });

    it('treats non-positive lines as line 1', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/app.rb',
          content: rubyContent,
          line: 0,
        })?.name
      ).toBe('Service');
    });
  });

  describe('findNearestBlock', () => {
    it('returns first, previous, and last as expected', () => {
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/app.rb',
          content: rubyContent,
          line: 1,
        })?.name
      ).toBe('Service');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/app.rb',
          content: rubyContent,
          line: 6,
        })?.name
      ).toBe('run');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/app.rb',
          content: rubyContent,
          line: 999,
        })?.name
      ).toBe('helper');
    });
  });

  describe('resolveDiagnosticAnchorLine', () => {
    const anchorContent = [
      'def run',
      '  true',
      'end',
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
          suggestedLine: 4,
          fromFixOperation: false,
        })
      ).toEqual({ line: 3, character: 0 });
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

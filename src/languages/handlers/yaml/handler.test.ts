import { YamlLanguageHandler } from './handler';

const yamlContent = [
  'apiVersion: v1',
  'kind: ConfigMap',
  '',
  'metadata:',
  '  name: app-config',
  '',
  'data:',
  '  key: value',
].join('\n');

describe('YamlLanguageHandler', () => {
  const handler = new YamlLanguageHandler();

  describe('detectLanguage', () => {
    it('detects yaml extensions and rejects non-yaml files', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/config.yaml',
          content: yamlContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/config.yml',
          content: yamlContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/CONFIG.YAML',
          content: yamlContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/config.json',
          content: yamlContent,
        })
      ).toBe(false);
    });
  });

  describe('getDocumentInfo', () => {
    it('returns yaml document metadata', () => {
      expect(
        handler.getDocumentInfo({
          filePath: '/workspace/config.yaml',
          content: yamlContent,
        })
      ).toMatchObject({
        languageId: 'yaml',
        fileName: 'config.yaml',
        extension: '.yaml',
        supportsBlocks: true,
        isConfigLike: true,
      });
    });
  });

  describe('listBlocks', () => {
    it('parses top-level yaml keys', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/config.yaml',
        content: yamlContent,
      });
      expect(blocks).toHaveLength(4);
      expect(blocks[0]).toMatchObject({
        type: 'yaml_key',
        name: 'apiVersion',
        startLine: 1,
      });
      expect(blocks[1]).toMatchObject({
        type: 'yaml_key',
        name: 'kind',
        startLine: 2,
      });
      expect(blocks[2]).toMatchObject({
        type: 'yaml_key',
        name: 'metadata',
        startLine: 4,
      });
    });

    it('parses multi-document separators and ignores nested-only files', () => {
      const content = [
        '---',
        'name: first',
        '---',
        'name: second',
        '  nested: true',
      ].join('\n');
      const blocks = handler.listBlocks({
        filePath: '/workspace/config.yaml',
        content,
      });
      expect(blocks[0]).toMatchObject({
        type: 'yaml_document',
        startLine: 1,
        endLine: 1,
      });
      expect(blocks[2]).toMatchObject({
        type: 'yaml_document',
        startLine: 3,
        endLine: 3,
      });
      expect(
        handler.listBlocks({
          filePath: '/workspace/config.yaml',
          content: ['  nested: true', '    deeper: true'].join('\n'),
        })
      ).toEqual([]);
    });
  });

  describe('findBlockAtLine', () => {
    it('returns containing block boundaries and null in gaps', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/config.yaml',
          content: yamlContent,
          line: 5,
        })?.name
      ).toBe('metadata');
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/config.yaml',
          content: yamlContent,
          line: 3,
        })?.name
      ).toBe('kind');
    });

    it('treats non-positive lines as line 1', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/config.yaml',
          content: yamlContent,
          line: 0,
        })?.name
      ).toBe('apiVersion');
    });
  });

  describe('findNearestBlock', () => {
    it('returns first, previous, and last as expected', () => {
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/config.yaml',
          content: yamlContent,
          line: 1,
        })?.name
      ).toBe('apiVersion');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/config.yaml',
          content: yamlContent,
          line: 6,
        })?.name
      ).toBe('metadata');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/config.yaml',
          content: yamlContent,
          line: 999,
        })?.name
      ).toBe('data');
    });
  });

  describe('resolveDiagnosticAnchorLine', () => {
    const anchorContent = [
      'apiVersion: v1',
      'kind: ConfigMap',
      '',
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
      ).toEqual({ line: 2, character: 0 });
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
      ).toEqual({ line: 2, character: 0 });
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

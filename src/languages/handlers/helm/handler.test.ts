import { HelmLanguageHandler } from './handler';

const helmContent = [
  'apiVersion: v2',
  'name: my-chart',
  'version: 0.1.0',
  '',
  'dependencies:',
  '  - name: redis',
].join('\n');

describe('HelmLanguageHandler', () => {
  const handler = new HelmLanguageHandler();

  describe('detectLanguage', () => {
    it('detects Helm chart/value files and rejects non-helm yaml', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/charts/app/Chart.yaml',
          content: helmContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/charts/app/values.yaml',
          content: 'replicaCount: 1',
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/k8s/deployment.yaml',
          content: 'apiVersion: apps/v1\nkind: Deployment',
        })
      ).toBe(false);
    });

    it('does not match template files and remains extension-case safe', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/charts/app/templates/deploy.yaml',
          content: '{{ .Values.image.repository }}',
        })
      ).toBe(false);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/charts/app/CHART.YAML',
          content: helmContent,
        })
      ).toBe(true);
    });
  });

  describe('getDocumentInfo', () => {
    it('returns helm document metadata', () => {
      expect(
        handler.getDocumentInfo({
          filePath: '/workspace/charts/app/Chart.yaml',
          content: helmContent,
        })
      ).toMatchObject({
        languageId: 'helm',
        fileName: 'Chart.yaml',
        extension: '.yaml',
        supportsBlocks: true,
        isConfigLike: true,
      });
    });
  });

  describe('listBlocks', () => {
    it('parses top-level yaml keys', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/charts/app/Chart.yaml',
        content: helmContent,
      });
      expect(blocks).toHaveLength(4);
      expect(blocks[0]).toMatchObject({
        type: 'helm_key',
        name: 'apiVersion',
        startLine: 1,
      });
      expect(blocks[1]).toMatchObject({
        type: 'helm_key',
        name: 'name',
        startLine: 2,
      });
    });

    it('returns empty for empty or keyless files', () => {
      expect(
        handler.listBlocks({
          filePath: '/workspace/charts/app/Chart.yaml',
          content: '',
        })
      ).toEqual([]);
      expect(
        handler.listBlocks({
          filePath: '/workspace/charts/app/Chart.yaml',
          content: ['  nested: true', '    stillNested: true'].join('\n'),
        })
      ).toEqual([]);
    });
  });

  describe('findBlockAtLine', () => {
    it('returns containing block boundaries and null in gaps', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/charts/app/Chart.yaml',
          content: helmContent,
          line: 2,
        })?.name
      ).toBe('name');
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/charts/app/Chart.yaml',
          content: helmContent,
          line: 4,
        })?.name
      ).toBe('version');
    });

    it('treats non-positive lines as line 1', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/charts/app/Chart.yaml',
          content: helmContent,
          line: 0,
        })?.name
      ).toBe('apiVersion');
    });
  });

  describe('findNearestBlock', () => {
    it('returns first, previous, and last as expected', () => {
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/charts/app/Chart.yaml',
          content: helmContent,
          line: 1,
        })?.name
      ).toBe('apiVersion');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/charts/app/Chart.yaml',
          content: helmContent,
          line: 4,
        })?.name
      ).toBe('version');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/charts/app/Chart.yaml',
          content: helmContent,
          line: 99,
        })?.name
      ).toBe('dependencies');
    });
  });

  describe('resolveDiagnosticAnchorLine', () => {
    const anchorContent = [
      'apiVersion: v2',
      'name: my-chart',
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

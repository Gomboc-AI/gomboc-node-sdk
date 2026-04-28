import { GoTemplateLanguageHandler } from './handler';

const gotemplateContent = [
  '{{ define "app.labels" }}',
  'app: demo',
  '{{ end }}',
  '',
  '{{ if .Values.enabled }}',
  'enabled: true',
  '{{ end }}',
].join('\n');

describe('GoTemplateLanguageHandler', () => {
  const handler = new GoTemplateLanguageHandler();

  describe('detectLanguage', () => {
    it('detects gotemplate extensions and ignores unrelated extensions', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/template.tmpl',
          content: gotemplateContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/template.gotmpl',
          content: gotemplateContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/template.txt',
          content: 'plain text',
        })
      ).toBe(false);
    });

    it('detects template syntax even without matching extension and is case-safe', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/TEMPLATE.TMPL',
          content: gotemplateContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/template',
          content: '{{ if .Values.enabled }}ok{{ end }}',
        })
      ).toBe(true);
    });
  });

  describe('getDocumentInfo', () => {
    it('returns gotemplate document metadata', () => {
      expect(
        handler.getDocumentInfo({
          filePath: '/workspace/template.tmpl',
          content: gotemplateContent,
        })
      ).toMatchObject({
        languageId: 'gotemplate',
        fileName: 'template.tmpl',
        extension: '.tmpl',
        supportsBlocks: true,
        isConfigLike: true,
      });
    });
  });

  describe('listBlocks', () => {
    it('parses define and control blocks with expected ranges', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/template.tmpl',
        content: gotemplateContent,
      });
      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toMatchObject({
        type: 'gotemplate_define',
        name: 'app.labels',
        startLine: 1,
        endLine: 3,
        header: 'define "app.labels"',
      });
      expect(blocks[1]).toMatchObject({
        type: 'gotemplate_control',
        name: 'if',
        startLine: 5,
        endLine: 7,
        header: 'if',
      });
    });

    it('returns empty for empty files and files without parseable blocks', () => {
      expect(
        handler.listBlocks({
          filePath: '/workspace/template.tmpl',
          content: '',
        })
      ).toEqual([]);
      expect(
        handler.listBlocks({
          filePath: '/workspace/template.tmpl',
          content: ['hello', 'world'].join('\n'),
        })
      ).toEqual([]);
    });

    it('supports nested template control blocks and unclosed blocks', () => {
      const content = [
        '{{ range .Values.items }}',
        '  {{ if .enabled }}',
        '  value: {{ .name }}',
        '  {{ end }}',
        '{{ end }}',
        '',
        '{{ define "left-open" }}',
        'name: demo',
      ].join('\n');
      const blocks = handler.listBlocks({
        filePath: '/workspace/template.tmpl',
        content,
      });
      expect(blocks.find(block => block.name === 'if')).toBeDefined();
      expect(blocks.find(block => block.name === 'range')).toBeDefined();
      expect(blocks.find(block => block.name === 'left-open')?.endLine).toBe(
        content.split('\n').length
      );
    });
  });

  describe('findBlockAtLine', () => {
    it('returns containing block at boundaries and null in gaps', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/template.tmpl',
          content: gotemplateContent,
          line: 1,
        })?.name
      ).toBe('app.labels');
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/template.tmpl',
          content: gotemplateContent,
          line: 3,
        })?.name
      ).toBe('app.labels');
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/template.tmpl',
          content: gotemplateContent,
          line: 4,
        })
      ).toBeNull();
    });

    it('returns innermost block for nested templates and clamps line <= 0', () => {
      const content = [
        '{{ range .Values.items }}',
        '  {{ if .enabled }}',
        '  value: {{ .name }}',
        '  {{ end }}',
        '{{ end }}',
      ].join('\n');
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/template.tmpl',
          content,
          line: 3,
        })?.name
      ).toBe('if');
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/template.tmpl',
          content: gotemplateContent,
          line: 0,
        })
      ).toMatchObject({ name: 'app.labels' });
    });
  });

  describe('findNearestBlock', () => {
    it('returns first before file, previous in gaps, and last after file', () => {
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/template.tmpl',
          content: gotemplateContent,
          line: 1,
        })?.name
      ).toBe('app.labels');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/template.tmpl',
          content: gotemplateContent,
          line: 4,
        })?.name
      ).toBe('app.labels');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/template.tmpl',
          content: gotemplateContent,
          line: 99,
        })?.name
      ).toBe('if');
    });
  });

  describe('resolveDiagnosticAnchorLine', () => {
    const anchorContent = [
      '{{ if .Values.enabled }}',
      '  enabled: true',
      '{{ end }}',
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

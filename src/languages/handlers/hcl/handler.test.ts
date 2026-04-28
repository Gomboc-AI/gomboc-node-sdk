import { HclLanguageHandler } from './handler';

const hclContent = [
  'locals {',
  '  env = "dev"',
  '}',
  '',
  'resource "aws_s3_bucket" "logs" {',
  '  bucket = "logs-bucket"',
  '}',
].join('\n');

describe('HclLanguageHandler', () => {
  const handler = new HclLanguageHandler();

  describe('detectLanguage', () => {
    it('detects .hcl and rejects non-hcl extensions', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/main.hcl',
          content: hclContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/main.tf',
          content: hclContent,
        })
      ).toBe(false);
    });

    it('is extension-case insensitive', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/MAIN.HCL',
          content: hclContent,
        })
      ).toBe(true);
    });
  });

  describe('getDocumentInfo', () => {
    it('returns hcl document metadata', () => {
      expect(
        handler.getDocumentInfo({
          filePath: '/workspace/main.hcl',
          content: hclContent,
        })
      ).toMatchObject({
        languageId: 'hcl',
        fileName: 'main.hcl',
        extension: '.hcl',
        supportsBlocks: true,
        isConfigLike: true,
      });
    });
  });

  describe('listBlocks', () => {
    it('parses locals and resource blocks', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/main.hcl',
        content: hclContent,
      });
      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toMatchObject({
        type: 'hcl_locals',
        name: 'locals',
        startLine: 1,
        endLine: 3,
      });
      expect(blocks[1]).toMatchObject({
        type: 'hcl_resource',
        name: 'logs',
        startLine: 5,
        endLine: 7,
      });
    });

    it('returns empty for empty or unparsable files', () => {
      expect(
        handler.listBlocks({ filePath: '/workspace/main.hcl', content: '' })
      ).toEqual([]);
      expect(
        handler.listBlocks({
          filePath: '/workspace/main.hcl',
          content: 'value = "x"',
        })
      ).toEqual([]);
    });
  });

  describe('findBlockAtLine', () => {
    it('returns containing blocks and null for gaps', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/main.hcl',
          content: hclContent,
          line: 2,
        })?.name
      ).toBe('locals');
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/main.hcl',
          content: hclContent,
          line: 4,
        })
      ).toBeNull();
    });

    it('treats non-positive lines as line 1', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/main.hcl',
          content: hclContent,
          line: 0,
        })?.name
      ).toBe('locals');
    });
  });

  describe('findNearestBlock', () => {
    it('returns first before file, previous in gaps, and last after file', () => {
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/main.hcl',
          content: hclContent,
          line: 1,
        })?.name
      ).toBe('locals');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/main.hcl',
          content: hclContent,
          line: 4,
        })?.name
      ).toBe('locals');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/main.hcl',
          content: hclContent,
          line: 99,
        })?.name
      ).toBe('logs');
    });
  });

  describe('resolveDiagnosticAnchorLine', () => {
    const anchorContent = [
      'resource "aws_s3_bucket" "logs" {',
      '  bucket = "logs-bucket"',
      '}',
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

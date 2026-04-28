import { TerraformLanguageHandler } from './handler';

const terraformContent = [
  'resource "aws_s3_bucket" "logs" {',
  '  bucket = "logs-bucket"',
  '}',
  '',
  'resource "aws_db_instance" "main" {',
  '  allocated_storage = 20',
  '}',
].join('\n');

describe('TerraformLanguageHandler', () => {
  const handler = new TerraformLanguageHandler();

  it('returns terraform document info metadata', () => {
    expect(
      handler.getDocumentInfo({
        filePath: '/workspace/main.tf',
        content: terraformContent,
      })
    ).toMatchObject({
      languageId: 'terraform',
      fileName: 'main.tf',
      extension: '.tf',
      supportsBlocks: true,
    });
  });

  describe('listBlocks', () => {
    it('lists terraform blocks with parsed ranges and headers', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/main.tf',
        content: terraformContent,
      });

      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toMatchObject({
        type: 'aws_s3_bucket',
        name: 'logs',
        startLine: 1,
        endLine: 3,
        header: 'resource "aws_s3_bucket" "logs"',
      });
      expect(blocks[1]).toMatchObject({
        type: 'aws_db_instance',
        name: 'main',
        startLine: 5,
        endLine: 7,
        header: 'resource "aws_db_instance" "main"',
      });
    });

    it('returns empty blocks for empty files and non-resource files', () => {
      expect(
        handler.listBlocks({ filePath: '/workspace/main.tf', content: '' })
      ).toEqual([]);
      expect(
        handler.listBlocks({
          filePath: '/workspace/main.tf',
          content: ['locals {', '  env = "dev"', '}'].join('\n'),
        })
      ).toEqual([]);
    });

    it('handles nested braces and keeps sibling resources separate', () => {
      const content = [
        'resource "aws_s3_bucket" "nested" {',
        '  tags = {',
        '    nested = {',
        '      owner = "platform"',
        '    }',
        '  }',
        '}',
        '',
        'resource "aws_db_instance" "main" {',
        '  allocated_storage = 20',
        '}',
      ].join('\n');

      const blocks = handler.listBlocks({
        filePath: '/workspace/main.tf',
        content,
      });
      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toMatchObject({
        name: 'nested',
        startLine: 1,
        endLine: 7,
      });
      expect(blocks[1]).toMatchObject({
        name: 'main',
        startLine: 9,
        endLine: 11,
      });
      expect(blocks[0].endLine).toBeLessThan(blocks[1].startLine);
    });
  });

  describe('findBlockAtLine and findNearestBlock', () => {
    it('finds exact block boundaries and nearest gaps', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/main.tf',
          content: terraformContent,
          line: 1,
        })?.name
      ).toBe('logs');
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/main.tf',
          content: terraformContent,
          line: 3,
        })?.name
      ).toBe('logs');
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/main.tf',
          content: terraformContent,
          line: 4,
        })
      ).toBeNull();
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/main.tf',
          content: terraformContent,
          line: 4,
        })?.name
      ).toBe('logs');
    });

    it('normalizes non-positive lines and out-of-range lines', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/main.tf',
          content: terraformContent,
          line: 0,
        })?.name
      ).toBe('logs');
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/main.tf',
          content: terraformContent,
          line: -1,
        })?.name
      ).toBe('logs');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/main.tf',
          content: terraformContent,
          line: 100,
        })?.name
      ).toBe('main');
    });
  });

  it('builds diagnostic context with anchor/header and fallback', () => {
    const withBlock = handler.buildDiagnosticContext({
      filePath: '/workspace/main.tf',
      content: terraformContent,
      hint: { line: 2, filePath: '/workspace/main.tf' },
    });
    const fallback = handler.buildDiagnosticContext({
      filePath: '/workspace/empty.tf',
      content: 'locals {\n  enabled = true\n}',
      hint: { line: 2, filePath: '/workspace/empty.tf' },
    });

    expect(withBlock.block?.name).toBe('logs');
    expect(withBlock.diagnosticAnchorLine).toBe(1);
    expect(withBlock.blockHeader).toBe('resource "aws_s3_bucket" "logs"');
    expect(withBlock.fallbackBlock).toBe(false);

    expect(fallback.block).toBeUndefined();
    expect(fallback.nearestBlock).toBeUndefined();
    expect(fallback.diagnosticAnchorLine).toBe(2);
    expect(fallback.blockHeader).toBe('empty.tf');
    expect(fallback.fallbackBlock).toBe(true);
  });

  it('has directory-scoped diagnosticClearScope', () => {
    expect(handler.diagnosticClearScope).toBe('directory');
  });

  it('has terraform codeResourceType', () => {
    expect(handler.codeResourceType).toBe('terraform');
  });

  describe('matchRulesToDiff', () => {
    it('returns all rules for empty and Resource block types', () => {
      const rules = ['rule-a', 'rule-b'];
      expect(
        handler.matchRulesToDiff({
          blockType: '',
          blockName: null,
          allFileRules: rules,
          diffLine: 1,
          diffContent: '',
          properties: [],
        })
      ).toEqual(rules);
      expect(
        handler.matchRulesToDiff({
          blockType: 'Resource',
          blockName: null,
          allFileRules: rules,
          diffLine: 1,
          diffContent: '',
          properties: [],
        })
      ).toEqual(rules);
    });

    it('matches provider variants and normalizes dashed resource names', () => {
      const rules = [
        'gomboc-ai/google-resources-google_compute_instance',
        'gomboc-ai/azurerm-resources-azurerm_storage_account',
        'gomboc-ai/hashicorp__aws-resources-aws_s3_bucket',
        'gomboc-ai/unrelated',
      ];
      expect(
        handler.matchRulesToDiff({
          blockType: 'google_compute_instance',
          blockName: 'vm',
          allFileRules: rules,
          diffLine: 1,
          diffContent: '',
          properties: [],
        })
      ).toContain(rules[0]);
      expect(
        handler.matchRulesToDiff({
          blockType: 'azurerm_storage_account',
          blockName: 'sa',
          allFileRules: rules,
          diffLine: 1,
          diffContent: '',
          properties: [],
        })
      ).toContain(rules[1]);
      expect(
        handler.matchRulesToDiff({
          blockType: 'aws-s3-bucket',
          blockName: 'logs',
          allFileRules: rules,
          diffLine: 1,
          diffContent: '',
          properties: [],
        })
      ).toContain(rules[2]);
    });

    it('falls back to all rules when no variants match', () => {
      const rules = ['rule-a', 'rule-b'];
      expect(
        handler.matchRulesToDiff({
          blockType: 'random_resource',
          blockName: 'x',
          allFileRules: rules,
          diffLine: 1,
          diffContent: '',
          properties: [],
        })
      ).toEqual(rules);
    });

    it('returns all rules when every rule matches', () => {
      const rules = [
        'gomboc-ai/aws-resources-aws_s3_bucket',
        'gomboc-ai/hashicorp__aws-resources-aws_s3_bucket',
      ];
      expect(
        handler.matchRulesToDiff({
          blockType: 'aws_s3_bucket',
          blockName: 'logs',
          allFileRules: rules,
          diffLine: 1,
          diffContent: '',
          properties: [],
        })
      ).toEqual(rules);
    });
  });

  it('formatBlockDisplayName uses type.name for terraform', () => {
    expect(
      handler.formatBlockDisplayName({
        blockType: 'aws_s3_bucket',
        blockName: 'logs',
        filePath: '/workspace/main.tf',
      })
    ).toBe('aws_s3_bucket.logs');
  });

  describe('detectLanguage', () => {
    it('detects terraform extensions case-insensitively', () => {
      expect(
        handler.detectLanguage({ filePath: '/workspace/main.tf', content: '' })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/vars.tfvars',
          content: '',
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({ filePath: '/workspace/main.TF', content: '' })
      ).toBe(true);
      expect(
        handler.detectLanguage({ filePath: '/workspace/main.hcl', content: '' })
      ).toBe(false);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/main.json',
          content: '',
        })
      ).toBe(false);
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

    it('caps long lines at max compact width', () => {
      const line =
        '  this_is_a_very_long_identifier_that_exceeds_24_chars = true';
      const result = handler.buildDiagnosticRange({
        line1Based: 1,
        content: line,
      });
      expect(result.endChar - result.startChar).toBe(24);
    });

    it('uses full trimmed width for short lines', () => {
      const line = '  ok';
      const result = handler.buildDiagnosticRange({
        line1Based: 1,
        content: line,
      });
      expect(result.endChar - result.startChar).toBe(line.trim().length);
    });

    it('returns [0,1] for empty and whitespace-only lines', () => {
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

  describe('resolveDiagnosticAnchorLine', () => {
    const weakAnchorContent = [
      'resource "aws_s3_bucket" "logs" {',
      '  bucket = "logs-bucket"',
      '}',
      '',
      '// trailing comment',
    ].join('\n');

    it('keeps fix operations on suggested line', () => {
      expect(
        handler.resolveDiagnosticAnchorLine({
          content: weakAnchorContent,
          suggestedLine: 2,
          fromFixOperation: true,
        })
      ).toEqual({ line: 2, character: 2 });
    });

    it('clamps fix operations above max line', () => {
      expect(
        handler.resolveDiagnosticAnchorLine({
          content: weakAnchorContent,
          suggestedLine: 999,
          fromFixOperation: true,
        })
      ).toEqual({ line: 5, character: 0 });
    });

    it('anchors add/no-op from weak line to nearest meaningful line above', () => {
      expect(
        handler.resolveDiagnosticAnchorLine({
          content: weakAnchorContent,
          suggestedLine: 3,
          fromFixOperation: false,
        })
      ).toEqual({ line: 2, character: 2 });
    });

    it('normalizes zero, negative, NaN, and fractional suggested lines', () => {
      expect(
        handler.resolveDiagnosticAnchorLine({
          content: weakAnchorContent,
          suggestedLine: 0,
          fromFixOperation: false,
        })
      ).toEqual({ line: 1, character: 0 });
      expect(
        handler.resolveDiagnosticAnchorLine({
          content: weakAnchorContent,
          suggestedLine: -5,
          fromFixOperation: false,
        })
      ).toEqual({ line: 1, character: 0 });
      expect(
        handler.resolveDiagnosticAnchorLine({
          content: weakAnchorContent,
          suggestedLine: Number.NaN,
          fromFixOperation: false,
        })
      ).toEqual({ line: 1, character: 0 });
      expect(
        handler.resolveDiagnosticAnchorLine({
          content: weakAnchorContent,
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

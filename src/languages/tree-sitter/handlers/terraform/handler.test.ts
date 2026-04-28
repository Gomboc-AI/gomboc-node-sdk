import { TreeSitterTerraformLanguageHandler } from './handler';

const twoResources = [
  'resource "aws_s3_bucket" "logs" {',
  '  bucket = "logs-bucket"',
  '}',
  '',
  'resource "aws_db_instance" "main" {',
  '  allocated_storage = 20',
  '}',
].join('\n');

const multiBlockTypes = [
  'resource "aws_s3_bucket" "logs" {',
  '  bucket = "logs-bucket"',
  '}',
  '',
  'data "aws_ami" "latest" {',
  '  most_recent = true',
  '}',
  '',
  'module "vpc" {',
  '  source = "./modules/vpc"',
  '}',
  '',
  'variable "instance_type" {',
  '  default = "t3.micro"',
  '}',
  '',
  'output "bucket_arn" {',
  '  value = aws_s3_bucket.logs.arn',
  '}',
  '',
  'locals {',
  '  env = "prod"',
  '}',
].join('\n');

const nestedBlocks = [
  'resource "aws_instance" "web" {',
  '  ami           = "ami-123"',
  '  instance_type = "t3.micro"',
  '',
  '  network_interface {',
  '    subnet_id = "subnet-abc"',
  '  }',
  '}',
].join('\n');

const multilineResource = [
  'resource "aws_security_group" "allow_tls" {',
  '  name        = "allow_tls"',
  '  description = "Allow TLS inbound traffic"',
  '',
  '  ingress {',
  '    from_port   = 443',
  '    to_port     = 443',
  '    protocol    = "tcp"',
  '    cidr_blocks = ["0.0.0.0/0"]',
  '  }',
  '',
  '  egress {',
  '    from_port   = 0',
  '    to_port     = 0',
  '    protocol    = "-1"',
  '    cidr_blocks = ["0.0.0.0/0"]',
  '  }',
  '}',
].join('\n');

const tfvarsContent = ['instance_type = "t3.micro"', 'region        = "us-east-1"'].join(
  '\n'
);

const emptyFile = '';

const localsOnly = ['locals {', '  env    = "prod"', '  region = "us-east-1"', '}'].join(
  '\n'
);

const handler = new TreeSitterTerraformLanguageHandler();
const filePath = '/workspace/main.tf';

describe('TreeSitterTerraformLanguageHandler', () => {
  describe('listBlocks', () => {
    it('lists two resource blocks with expected type, name, and header', () => {
      const blocks = handler.listBlocks({ filePath, content: twoResources });

      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toMatchObject({
        type: 'aws_s3_bucket',
        name: 'logs',
        header: 'resource "aws_s3_bucket" "logs"',
      });
    });

    it('lists all expected block kinds in multiBlockTypes', () => {
      const blocks = handler.listBlocks({ filePath, content: multiBlockTypes });

      expect(blocks).toHaveLength(6);
      expect(blocks.map(block => block.type)).toEqual([
        'aws_s3_bucket',
        'aws_ami',
        'module',
        'variable',
        'output',
        'locals',
      ]);
    });

    it('maps data block to aws_ami.latest', () => {
      const blocks = handler.listBlocks({ filePath, content: multiBlockTypes });
      const data = blocks.find(block => block.header === 'data "aws_ami" "latest"');

      expect(data).toBeDefined();
      expect(data?.type).toBe('aws_ami');
      expect(data?.name).toBe('latest');
    });

    it('maps module block to module.vpc', () => {
      const blocks = handler.listBlocks({ filePath, content: multiBlockTypes });
      const moduleBlock = blocks.find(block => block.header === 'module "vpc"');

      expect(moduleBlock).toBeDefined();
      expect(moduleBlock?.type).toBe('module');
      expect(moduleBlock?.name).toBe('vpc');
    });

    it('maps locals block with undefined name', () => {
      const blocks = handler.listBlocks({ filePath, content: localsOnly });

      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('locals');
      expect(blocks[0].name).toBeUndefined();
      expect(blocks[0].header).toBe('locals');
    });

    it('returns only one top-level block for nestedBlocks', () => {
      const blocks = handler.listBlocks({ filePath, content: nestedBlocks });

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        type: 'aws_instance',
        name: 'web',
        header: 'resource "aws_instance" "web"',
      });
      expect(blocks.some(block => block.header.includes('network_interface'))).toBe(false);
    });

    it('returns no blocks for empty files', () => {
      const blocks = handler.listBlocks({ filePath, content: emptyFile });
      expect(blocks).toEqual([]);
    });

    it('returns no blocks for tfvars attributes-only content', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/terraform.tfvars',
        content: tfvarsContent,
      });
      expect(blocks).toEqual([]);
    });
  });

  describe('findBlockAtLine', () => {
    it('returns logs block on declaration line', () => {
      const block = handler.findBlockAtLine({ filePath, content: twoResources, line: 1 });
      expect(block?.name).toBe('logs');
    });

    it('returns logs block on inner body line', () => {
      const block = handler.findBlockAtLine({ filePath, content: twoResources, line: 2 });
      expect(block?.name).toBe('logs');
    });

    it('returns logs block on closing brace line', () => {
      const block = handler.findBlockAtLine({ filePath, content: twoResources, line: 3 });
      expect(block?.name).toBe('logs');
    });

    it('returns null on blank line between blocks', () => {
      const block = handler.findBlockAtLine({ filePath, content: twoResources, line: 4 });
      expect(block).toBeNull();
    });

    it('returns main block inside main resource body', () => {
      const block = handler.findBlockAtLine({ filePath, content: twoResources, line: 6 });
      expect(block?.name).toBe('main');
    });

    it('returns outer aws_instance block for nested network_interface line', () => {
      const block = handler.findBlockAtLine({ filePath, content: nestedBlocks, line: 6 });
      expect(block?.type).toBe('aws_instance');
      expect(block?.name).toBe('web');
    });
  });

  describe('findNearestBlock', () => {
    it('returns preceding logs block for gap line between resources', () => {
      const block = handler.findNearestBlock({ filePath, content: twoResources, line: 4 });
      expect(block?.name).toBe('logs');
    });

    it('returns main block past end of file', () => {
      const block = handler.findNearestBlock({ filePath, content: twoResources, line: 100 });
      expect(block?.name).toBe('main');
    });

    it('returns first block on first line', () => {
      const block = handler.findNearestBlock({ filePath, content: twoResources, line: 1 });
      expect(block?.name).toBe('logs');
    });
  });

  describe('resolveDiagnosticAnchorLine', () => {
    it('anchors non-fix edits to the exact suggested line', () => {
      const anchor = handler.resolveDiagnosticAnchorLine({
        content: twoResources,
        suggestedLine: 2,
        fromFixOperation: false,
      });
      expect(anchor).toBe(2);
    });

    it('keeps anchor on suggested declaration line', () => {
      const anchor = handler.resolveDiagnosticAnchorLine({
        content: twoResources,
        suggestedLine: 1,
        fromFixOperation: false,
      });
      expect(anchor).toBe(1);
    });

    it('anchors insertion one line past EOF to the nearest node above', () => {
      const anchor = handler.resolveDiagnosticAnchorLine({
        content: twoResources,
        suggestedLine: twoResources.split('\n').length + 1,
        fromFixOperation: true,
      });
      expect(anchor).toBe(7);
    });

    it('anchors insertion several lines past EOF to the same nearest node above', () => {
      const anchor = handler.resolveDiagnosticAnchorLine({
        content: twoResources,
        suggestedLine: twoResources.split('\n').length + 5,
        fromFixOperation: true,
      });
      expect(anchor).toBe(7);
    });

    it('returns 1 for empty files regardless of suggested line', () => {
      const anchor = handler.resolveDiagnosticAnchorLine({
        content: emptyFile,
        suggestedLine: 42,
        fromFixOperation: false,
      });
      expect(anchor).toBe(1);
    });
  });

  describe('buildDiagnosticRange', () => {
    it('returns startChar 0 for top-level resource line', () => {
      const range = handler.buildDiagnosticRange({
        line1Based: 1,
        content: 'resource "aws_s3_bucket" "logs" {',
      });
      expect(range.startChar).toBe(0);
      expect(range.endChar).toBeGreaterThanOrEqual('resource'.length);
    });

    it('returns first non-whitespace startChar for indented line', () => {
      const range = handler.buildDiagnosticRange({
        line1Based: 6,
        content: multilineResource,
      });
      expect(range.startChar).toBe(4);
      expect(range.endChar).toBeGreaterThan(range.startChar);
    });
  });

  describe('matchRulesToDiff', () => {
    it('matches only aws_s3_bucket-specific rules when blockType is aws_s3_bucket', () => {
      const rules = [
        'gomboc-ai/ensure_encryption_for_hashicorp__aws-resources-aws_s3_bucket',
        'gomboc-ai/ensure_logging_for_hashicorp__aws-resources-aws_db_instance',
      ];

      const matched = handler.matchRulesToDiff({
        blockType: 'aws_s3_bucket',
        blockName: 'logs',
        allFileRules: rules,
        diffLine: 2,
        diffContent: 'bucket = "logs-bucket"',
        properties: ['bucket'],
      });

      expect(matched).toEqual([rules[0]]);
    });

    it('returns all rules for generic Resource block type', () => {
      const rules = ['rule-a', 'rule-b'];
      const matched = handler.matchRulesToDiff({
        blockType: 'Resource',
        blockName: null,
        allFileRules: rules,
        diffLine: 1,
        diffContent: '',
        properties: [],
      });
      expect(matched).toEqual(rules);
    });

    it('returns all rules for null blockType', () => {
      const rules = ['rule-a', 'rule-b'];
      const matched = handler.matchRulesToDiff({
        blockType: null as unknown as string,
        blockName: null,
        allFileRules: rules,
        diffLine: 1,
        diffContent: '',
        properties: [],
      });
      expect(matched).toEqual(rules);
    });

    it('matches hashicorp__aws-resources-aws_s3_bucket variant', () => {
      const rules = [
        'gomboc-ai/ensure_encryption_for_hashicorp__aws-resources-aws_s3_bucket',
      ];

      const matched = handler.matchRulesToDiff({
        blockType: 'aws_s3_bucket',
        blockName: 'logs',
        allFileRules: rules,
        diffLine: 2,
        diffContent: 'bucket = "logs-bucket"',
        properties: ['bucket'],
      });

      expect(matched).toEqual(rules);
    });
  });

  describe('detectLanguage', () => {
    it('detects .tf files', () => {
      expect(handler.detectLanguage({ filePath: '/workspace/main.tf', content: '' })).toBe(
        true
      );
    });

    it('detects .tfvars files', () => {
      expect(
        handler.detectLanguage({ filePath: '/workspace/terraform.tfvars', content: '' })
      ).toBe(true);
    });

    it('detects .hcl files', () => {
      expect(handler.detectLanguage({ filePath: '/workspace/main.hcl', content: '' })).toBe(
        true
      );
    });

    it('does not detect .py files', () => {
      expect(handler.detectLanguage({ filePath: '/workspace/app.py', content: '' })).toBe(
        false
      );
    });

    it('does not detect .json files', () => {
      expect(handler.detectLanguage({ filePath: '/workspace/data.json', content: '' })).toBe(
        false
      );
    });
  });

  describe('metadata', () => {
    it('has directory scoped diagnostic clearing', () => {
      expect(handler.diagnosticClearScope).toBe('directory');
    });

    it('has terraform codeResourceType', () => {
      expect(handler.codeResourceType).toBe('terraform');
    });

    it('returns terraform resource context extract kind', () => {
      expect(handler.getResourceContextExtractKind()).toBe('terraform');
    });

    it('returns expected document info for main.tf', () => {
      expect(
        handler.getDocumentInfo({
          filePath: '/workspace/main.tf',
          content: twoResources,
        })
      ).toEqual({
        languageId: 'terraform',
        filePath: '/workspace/main.tf',
        fileName: 'main.tf',
        extension: '.tf',
        isConfigLike: true,
        supportsBlocks: true,
      });
    });
  });
});

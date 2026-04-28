import { TreeSitterCloudFormationYamlLanguageHandler } from './handler';

const twoResources = [
  'AWSTemplateFormatVersion: "2010-09-09"',
  'Resources:',
  '  AppBucket:',
  '    Type: AWS::S3::Bucket',
  '    Properties:',
  '      BucketName: app-bucket',
  '  AppRole:',
  '    Type: AWS::IAM::Role',
  '    Properties:',
  '      RoleName: app-role',
].join('\n');

const adjacentResources = [
  'Resources:',
  '  MyBucket:',
  '    Type: AWS::S3::Bucket',
  '    Properties:',
  '      BucketName: test-bucket',
  '  MyTable:',
  '    Type: AWS::DynamoDB::Table',
  '    Properties:',
  '      BillingMode: PAY_PER_REQUEST',
].join('\n');

const withOutputs = [
  'Resources:',
  '  MyBucket:',
  '    Type: AWS::S3::Bucket',
  '    Properties:',
  '      BucketName: my-bucket',
  'Outputs:',
  '  BucketArn:',
  '    Value: !GetAtt MyBucket.Arn',
].join('\n');

const noTypeField = [
  'Resources:',
  '  WeirdResource:',
  '    Properties:',
  '      Something: value',
].join('\n');

const noResourcesSection = [
  'AWSTemplateFormatVersion: "2010-09-09"',
  'Description: A template with no resources',
].join('\n');

const kubernetesYaml = [
  'apiVersion: apps/v1',
  'kind: Deployment',
  'metadata:',
  '  name: my-app',
].join('\n');

const helmTemplate = [
  'apiVersion: v1',
  'kind: ConfigMap',
  'metadata:',
  '  name: {{ .Values.name }}',
].join('\n');

const emptyFile = '';

const handler = new TreeSitterCloudFormationYamlLanguageHandler();

describe('TreeSitterCloudFormationYamlLanguageHandler', () => {
  describe('listBlocks', () => {
    it('lists Resources entries as CloudFormation blocks', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/template.yaml',
        content: twoResources,
      });

      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toMatchObject({
        type: 'AWS::S3::Bucket',
        name: 'AppBucket',
        header: 'AppBucket (AWS::S3::Bucket)',
      });
      expect(blocks[1]).toMatchObject({
        type: 'AWS::IAM::Role',
        name: 'AppRole',
      });
    });

    it('ignores non-Resources top-level sections', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/template.yaml',
        content: withOutputs,
      });

      expect(blocks).toHaveLength(1);
      expect(blocks[0].name).toBe('MyBucket');
    });

    it('falls back to cloudformation_resource when Type is missing', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/template.yaml',
        content: noTypeField,
      });

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        type: 'cloudformation_resource',
        name: 'WeirdResource',
        header: 'WeirdResource',
      });
    });

    it('returns empty list without Resources section', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/template.yaml',
        content: noResourcesSection,
      });
      expect(blocks).toEqual([]);
    });

    it('returns empty list for empty files', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/template.yaml',
        content: emptyFile,
      });
      expect(blocks).toEqual([]);
    });
  });

  describe('findBlockAtLine', () => {
    it('finds AppBucket at its key line', () => {
      const block = handler.findBlockAtLine({
        filePath: '/workspace/template.yaml',
        content: twoResources,
        line: 3,
      });
      expect(block?.name).toBe('AppBucket');
    });

    it('finds AppBucket inside its body', () => {
      const block = handler.findBlockAtLine({
        filePath: '/workspace/template.yaml',
        content: twoResources,
        line: 5,
      });
      expect(block?.name).toBe('AppBucket');
    });

    it('finds AppRole at its key line', () => {
      const block = handler.findBlockAtLine({
        filePath: '/workspace/template.yaml',
        content: twoResources,
        line: 7,
      });
      expect(block?.name).toBe('AppRole');
    });

    it('returns null for lines outside any resource block', () => {
      const block = handler.findBlockAtLine({
        filePath: '/workspace/template.yaml',
        content: twoResources,
        line: 1,
      });
      expect(block).toBeNull();
    });

    it('keeps adjacent resources non-overlapping at boundary lines', () => {
      const firstBlock = handler.findBlockAtLine({
        filePath: '/workspace/template.yaml',
        content: adjacentResources,
        line: 5,
      });
      const secondBlock = handler.findBlockAtLine({
        filePath: '/workspace/template.yaml',
        content: adjacentResources,
        line: 6,
      });

      expect(firstBlock?.name).toBe('MyBucket');
      expect(secondBlock?.name).toBe('MyTable');
    });
  });

  describe('findNearestBlock', () => {
    it('returns last resource when line is past EOF', () => {
      const block = handler.findNearestBlock({
        filePath: '/workspace/template.yaml',
        content: twoResources,
        line: 100,
      });
      expect(block?.name).toBe('AppRole');
    });

    it('returns null on Resources line before first resource block', () => {
      const block = handler.findNearestBlock({
        filePath: '/workspace/template.yaml',
        content: twoResources,
        line: 2,
      });
      expect(block).toBeNull();
    });
  });

  describe('resolveDiagnosticAnchorLine', () => {
    it('anchors to exact changed pair line inside a resource body', () => {
      const anchor = handler.resolveDiagnosticAnchorLine({
        content: twoResources,
        suggestedLine: 5,
        fromFixOperation: false,
      });
      expect(anchor).toBe(5);
    });

    it('anchors to resource key line when suggestion is already key line', () => {
      const anchor = handler.resolveDiagnosticAnchorLine({
        content: twoResources,
        suggestedLine: 3,
        fromFixOperation: false,
      });
      expect(anchor).toBe(3);
    });

    it('anchors insertion past EOF to start line of last node', () => {
      const anchor = handler.resolveDiagnosticAnchorLine({
        content: twoResources,
        suggestedLine: twoResources.split('\n').length + 1,
        fromFixOperation: true,
      });
      expect(anchor).toBe(10);
    });

    it('returns 1 for empty files', () => {
      const anchor = handler.resolveDiagnosticAnchorLine({
        content: emptyFile,
        suggestedLine: 42,
        fromFixOperation: false,
      });
      expect(anchor).toBe(1);
    });
  });

  describe('buildDiagnosticRange', () => {
    it('computes startChar for 2-space indentation', () => {
      const range = handler.buildDiagnosticRange({
        line1Based: 1,
        content: '  AppBucket:',
      });
      expect(range.startChar).toBe(2);
    });

    it('computes startChar for 6-space indentation', () => {
      const range = handler.buildDiagnosticRange({
        line1Based: 1,
        content: '      BucketName: app-bucket',
      });
      expect(range.startChar).toBe(6);
    });

    it('computes startChar for top-level key', () => {
      const range = handler.buildDiagnosticRange({
        line1Based: 1,
        content: 'Resources:',
      });
      expect(range.startChar).toBe(0);
    });
  });

  describe('buildDiagnosticContext', () => {
    it('uses block header when a block is found', () => {
      const ctx = handler.buildDiagnosticContext({
        filePath: '/workspace/template.yaml',
        content: twoResources,
        hint: { line: 5, filePath: '/workspace/template.yaml' },
      });

      expect(ctx.block?.name).toBe('AppBucket');
      expect(ctx.blockHeader).toBe('AppBucket (AWS::S3::Bucket)');
      expect(ctx.fallbackBlock).toBe(false);
    });

    it('uses CloudFormation file fallback without Resources', () => {
      const ctx = handler.buildDiagnosticContext({
        filePath: '/workspace/template.yaml',
        content: noResourcesSection,
        hint: { line: 1, filePath: '/workspace/template.yaml' },
      });

      expect(ctx.block).toBeUndefined();
      expect(ctx.blockHeader).toBe('CloudFormation template.yaml');
      expect(ctx.fallbackBlock).toBe(true);
    });

    it('keeps filename-based fallback for Kubernetes-like YAML', () => {
      const ctx = handler.buildDiagnosticContext({
        filePath: '/workspace/deployment.yaml',
        content: kubernetesYaml,
        hint: { line: 2, filePath: '/workspace/deployment.yaml' },
      });

      expect(ctx.block).toBeUndefined();
      expect(ctx.blockHeader).toContain('deployment.yaml');
      expect(ctx.fallbackBlock).toBe(true);
    });
  });

  describe('matchRulesToDiff', () => {
    it('matches by full block type then context tokens', () => {
      const matched = handler.matchRulesToDiff({
        blockType: 'AWS::S3::Bucket',
        blockName: 'MyBucket',
        allFileRules: [
          'gomboc-ai/ensure_data_at_rest_is_encrypted_for_hashicorp__aws-resources-aws_s3_bucket000',
          'gomboc-ai/deny_public_access_for_hashicorp__aws-resources-aws_s3_bucket001',
          'gomboc-ai/ensure_pitr_for_hashicorp__aws-resources-aws_dynamodb_table000',
        ],
        diffLine: 12,
        diffContent: 'PublicAccessBlockConfiguration:',
        properties: ['public_access_block_configuration'],
      });

      expect(matched).toEqual([
        'gomboc-ai/deny_public_access_for_hashicorp__aws-resources-aws_s3_bucket001',
      ]);
    });

    it('falls back to service-scoped matches when type-specific matches are missing', () => {
      const allFileRules = [
        'gomboc-ai/ensure_s3_public_access_block_for_hashicorp__aws-resources-aws_s3_bucket000',
        'gomboc-ai/ensure_kms_key_rotation_for_hashicorp__aws-resources-aws_kms_key000',
        'gomboc-ai/ensure_kms_key_policy_for_hashicorp__aws-resources-aws_kms_key001',
      ];
      const matched = handler.matchRulesToDiff({
        blockType: 'AWS::KMS::Alias',
        blockName: 'LogsKeyAlias',
        allFileRules,
        diffLine: 20,
        diffContent: 'AliasName: !Sub "alias/logs"',
        properties: ['alias_name'],
      });

      expect(matched).toEqual([
        'gomboc-ai/ensure_kms_key_rotation_for_hashicorp__aws-resources-aws_kms_key000',
        'gomboc-ai/ensure_kms_key_policy_for_hashicorp__aws-resources-aws_kms_key001',
      ]);
    });

    it('returns empty when no type-level or service-level match exists', () => {
      const matched = handler.matchRulesToDiff({
        blockType: 'AWS::KMS::Alias',
        blockName: 'LogsKeyAlias',
        allFileRules: [
          'gomboc-ai/ensure_s3_public_access_block_for_hashicorp__aws-resources-aws_s3_bucket000',
          'gomboc-ai/ensure_pitr_for_hashicorp__aws-resources-aws_dynamodb_table000',
        ],
        diffLine: 30,
        diffContent: 'TargetKeyId: !Ref LogsKey',
        properties: ['target_key_id'],
      });

      expect(matched).toEqual([]);
    });
  });

  describe('detectLanguage', () => {
    it('detects .yaml files with Resources content', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/template.yaml',
          content: twoResources,
        })
      ).toBe(true);
    });

    it('detects .yml files with Resources content', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/template.yml',
          content: twoResources,
        })
      ).toBe(true);
    });

    it('excludes Kubernetes yaml by content', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/deploy.yaml',
          content: kubernetesYaml,
        })
      ).toBe(false);
    });

    it('excludes Helm templates by content', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/template.yaml',
          content: helmTemplate,
        })
      ).toBe(false);
    });

    it('excludes yaml files in charts directories', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/charts/app/values.yaml',
          content: twoResources,
        })
      ).toBe(false);
    });

    it('excludes yaml files in k8s directories', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/k8s/manifests/deployment.yaml',
          content: twoResources,
        })
      ).toBe(false);
    });

    it('does not detect json files', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/template.json',
          content: '{}',
        })
      ).toBe(false);
    });
  });

  describe('metadata', () => {
    it('has cloudformation codeResourceType', () => {
      expect(handler.codeResourceType).toBe('cloudformation');
    });

    it('returns yaml resource context extract kind', () => {
      expect(handler.getResourceContextExtractKind()).toBe('yaml');
    });

    it('returns expected document info for template.yaml', () => {
      expect(
        handler.getDocumentInfo({
          filePath: '/workspace/template.yaml',
          content: twoResources,
        })
      ).toEqual({
        languageId: 'cloudformation-yaml',
        filePath: '/workspace/template.yaml',
        fileName: 'template.yaml',
        extension: '.yaml',
        isConfigLike: true,
        supportsBlocks: true,
      });
    });
  });
});

import { TreeSitterCloudFormationJsonLanguageHandler } from './handler';

const twoResources = JSON.stringify(
  {
    AWSTemplateFormatVersion: '2010-09-09',
    Resources: {
      AppBucket: {
        Type: 'AWS::S3::Bucket',
        Properties: {
          BucketName: 'app-bucket',
        },
      },
      AppQueue: {
        Type: 'AWS::SQS::Queue',
      },
    },
  },
  null,
  2
);

const withOutputs = JSON.stringify(
  {
    Resources: {
      MyBucket: {
        Type: 'AWS::S3::Bucket',
        Properties: { BucketName: 'my-bucket' },
      },
    },
    Outputs: {
      BucketArn: {
        Value: { 'Fn::GetAtt': ['MyBucket', 'Arn'] },
      },
    },
  },
  null,
  2
);

const noTypeField = JSON.stringify(
  {
    Resources: {
      WeirdResource: {
        Properties: { Something: 'value' },
      },
    },
  },
  null,
  2
);

const noResourcesSection = JSON.stringify(
  {
    AWSTemplateFormatVersion: '2010-09-09',
    Description: 'No resources here',
  },
  null,
  2
);

const invalidJson = '{ invalid json';
const emptyFile = '';

const handler = new TreeSitterCloudFormationJsonLanguageHandler();

const findLineContaining = (content: string, needle: string): number =>
  Math.max(1, content.split('\n').findIndex(line => line.includes(needle)) + 1);

describe('TreeSitterCloudFormationJsonLanguageHandler', () => {
  describe('listBlocks', () => {
    it('lists Resources entries as CloudFormation blocks', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/template.json',
        content: twoResources,
      });

      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toMatchObject({
        type: 'AWS::S3::Bucket',
        name: 'AppBucket',
        header: 'AppBucket (AWS::S3::Bucket)',
      });
      expect(blocks[1]).toMatchObject({
        type: 'AWS::SQS::Queue',
        name: 'AppQueue',
      });
      expect(blocks[0].endLine).toBe(blocks[1].startLine - 1);
    });

    it('ignores non-Resources top-level sections', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/template.json',
        content: withOutputs,
      });

      expect(blocks).toHaveLength(1);
      expect(blocks[0].name).toBe('MyBucket');
    });

    it('falls back to cloudformation_resource when Type is missing', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/template.json',
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
        filePath: '/workspace/template.json',
        content: noResourcesSection,
      });
      expect(blocks).toEqual([]);
    });

    it('returns empty list for malformed json', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/broken.json',
        content: invalidJson,
      });
      expect(blocks).toEqual([]);
    });

    it('returns empty list for empty files', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/template.json',
        content: emptyFile,
      });
      expect(blocks).toEqual([]);
    });
  });

  describe('findBlockAtLine', () => {
    it('finds blocks by line and ignores top-level non-resource lines', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/template.json',
        content: twoResources,
      });
      const appBucket = blocks[0];
      const appQueue = blocks[1];
      const bucketNameLine = findLineContaining(twoResources, '"BucketName":');

      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/template.json',
          content: twoResources,
          line: appBucket.startLine,
        })?.name
      ).toBe('AppBucket');
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/template.json',
          content: twoResources,
          line: bucketNameLine,
        })?.name
      ).toBe('AppBucket');
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/template.json',
          content: twoResources,
          line: appQueue.startLine,
        })?.name
      ).toBe('AppQueue');
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/template.json',
          content: twoResources,
          line: 1,
        })
      ).toBeNull();
    });

    it('does not treat Outputs lines as resource blocks', () => {
      const outputsLine = findLineContaining(withOutputs, '"Outputs":');
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/template.json',
          content: withOutputs,
          line: outputsLine + 1,
        })
      ).toBeNull();
    });
  });

  describe('findNearestBlock', () => {
    it('returns last resource when line is past EOF', () => {
      const block = handler.findNearestBlock({
        filePath: '/workspace/template.json',
        content: twoResources,
        line: twoResources.split('\n').length + 10,
      });
      expect(block?.name).toBe('AppQueue');
    });

    it('returns null before the first resource block', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/template.json',
        content: twoResources,
      });

      const block = handler.findNearestBlock({
        filePath: '/workspace/template.json',
        content: twoResources,
        line: Math.max(1, blocks[0].startLine - 1),
      });
      expect(block).toBeNull();
    });
  });

  describe('resolveDiagnosticAnchorLine', () => {
    it('keeps exact suggested line inside resource body', () => {
      const bucketNameLine = findLineContaining(twoResources, '"BucketName":');
      const anchor = handler.resolveDiagnosticAnchorLine({
        content: twoResources,
        suggestedLine: bucketNameLine,
        fromFixOperation: false,
      });
      expect(anchor).toBe(bucketNameLine);
    });

    it('keeps exact suggested line on resource key line', () => {
      const appBucketLine = findLineContaining(twoResources, '"AppBucket":');
      const anchor = handler.resolveDiagnosticAnchorLine({
        content: twoResources,
        suggestedLine: appBucketLine,
        fromFixOperation: false,
      });
      expect(anchor).toBe(appBucketLine);
    });

    it('anchors insertion past EOF to the last named node start line', () => {
      const anchor = handler.resolveDiagnosticAnchorLine({
        content: twoResources,
        suggestedLine: twoResources.split('\n').length + 1,
        fromFixOperation: true,
      });
      const expected = findLineContaining(twoResources, '"AWS::SQS::Queue"');
      expect(anchor).toBe(expected);
    });

    it('clamps gracefully on malformed json', () => {
      const anchor = handler.resolveDiagnosticAnchorLine({
        content: invalidJson,
        suggestedLine: 100,
        fromFixOperation: false,
      });
      expect(anchor).toBeGreaterThanOrEqual(1);
    });
  });

  describe('buildDiagnosticRange', () => {
    it('computes startChar for two-space indentation on resource key line', () => {
      const appBucketLine = findLineContaining(twoResources, '"AppBucket":');
      const range = handler.buildDiagnosticRange({
        line1Based: appBucketLine,
        content: twoResources,
      });
      expect(range.startChar).toBe(4);
    });

    it('computes startChar for six-space indentation on nested property line', () => {
      const bucketNameLine = findLineContaining(twoResources, '"BucketName":');
      const range = handler.buildDiagnosticRange({
        line1Based: bucketNameLine,
        content: twoResources,
      });
      expect(range.startChar).toBe(8);
    });
  });

  describe('buildDiagnosticContext', () => {
    it('uses resource header when a block is found', () => {
      const bucketNameLine = findLineContaining(twoResources, '"BucketName":');
      const ctx = handler.buildDiagnosticContext({
        filePath: '/workspace/template.json',
        content: twoResources,
        hint: { line: bucketNameLine, filePath: '/workspace/template.json' },
      });

      expect(ctx.block?.name).toBe('AppBucket');
      expect(ctx.blockHeader).toBe('AppBucket (AWS::S3::Bucket)');
      expect(ctx.fallbackBlock).toBe(false);
    });

    it('uses CloudFormation fallback header for malformed json', () => {
      const ctx = handler.buildDiagnosticContext({
        filePath: '/workspace/broken.json',
        content: invalidJson,
        hint: { line: 1, filePath: '/workspace/broken.json' },
      });

      expect(ctx.block).toBeUndefined();
      expect(ctx.blockHeader).toBe('CloudFormation broken.json');
      expect(ctx.fallbackBlock).toBe(true);
    });

    it('uses filename-based fallback when Resources are absent', () => {
      const ctx = handler.buildDiagnosticContext({
        filePath: '/workspace/stack.json',
        content: noResourcesSection,
        hint: { line: 1, filePath: '/workspace/stack.json' },
      });

      expect(ctx.block).toBeUndefined();
      expect(ctx.blockHeader).toContain('stack.json');
      expect(ctx.fallbackBlock).toBe(true);
    });
  });

  describe('detectLanguage', () => {
    it('detects template.json', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/template.json',
          content: '{}',
        })
      ).toBe(true);
    });

    it('detects cloudformation.json', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/cloudformation.json',
          content: '{}',
        })
      ).toBe(true);
    });

    it('detects cfn-stack.json', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/cfn-stack.json',
          content: '{}',
        })
      ).toBe(true);
    });

    it('detects stack.json', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/stack.json',
          content: '{}',
        })
      ).toBe(true);
    });

    it('does not detect non-cloudformation json names', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/data.json',
          content: '{}',
        })
      ).toBe(false);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/tsconfig.json',
          content: '{}',
        })
      ).toBe(false);
    });

    it('excludes package.json and package-lock.json', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/package.json',
          content: '{}',
        })
      ).toBe(false);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/package-lock.json',
          content: '{}',
        })
      ).toBe(false);
    });

    it('does not detect non-json extensions', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/template.yaml',
          content: 'Resources: {}',
        })
      ).toBe(false);
    });
  });

  describe('metadata', () => {
    it('has cloudformation codeResourceType', () => {
      expect(handler.codeResourceType).toBe('cloudformation');
    });

    it('returns json resource context extract kind', () => {
      expect(handler.getResourceContextExtractKind()).toBe('json');
    });

    it('returns expected document info for template.json', () => {
      expect(
        handler.getDocumentInfo({
          filePath: '/workspace/template.json',
          content: twoResources,
        })
      ).toEqual({
        languageId: 'cloudformation-json',
        filePath: '/workspace/template.json',
        fileName: 'template.json',
        extension: '.json',
        isConfigLike: true,
        supportsBlocks: true,
      });
    });
  });
});

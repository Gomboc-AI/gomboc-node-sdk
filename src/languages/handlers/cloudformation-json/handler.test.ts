import { CloudFormationJsonLanguageHandler } from './handler';

const cloudFormationJson = JSON.stringify(
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

describe('CloudFormationJSONLanguageHandler', () => {
  const handler = new CloudFormationJsonLanguageHandler();

  it('detectLanguage matches template-like basenames only', () => {
    expect(
      handler.detectLanguage({
        filePath: '/workspace/template.json',
        content: '',
      })
    ).toBe(true);
    expect(
      handler.detectLanguage({ filePath: '/workspace/data.json', content: '' })
    ).toBe(false);
    expect(
      handler.detectLanguage({
        filePath: '/workspace/package.json',
        content: '{}',
      })
    ).toBe(false);
    expect(
      handler.detectLanguage({
        filePath: '/workspace/cloudformation.json',
        content: '',
      })
    ).toBe(true);
    expect(
      handler.detectLanguage({ filePath: '/workspace/cfn.json', content: '' })
    ).toBe(true);
    expect(
      handler.detectLanguage({
        filePath: '/workspace/cf-template.json',
        content: '',
      })
    ).toBe(true);
    expect(
      handler.detectLanguage({
        filePath: '/workspace/package-lock.json',
        content: '{}',
      })
    ).toBe(false);
    expect(
      handler.detectLanguage({ filePath: '/workspace/stack.yaml', content: '' })
    ).toBe(false);
  });

  it('returns cloudformation json document info metadata', () => {
    expect(
      handler.getDocumentInfo({
        filePath: '/workspace/template.json',
        content: cloudFormationJson,
      })
    ).toMatchObject({
      languageId: 'cloudformation-json',
      fileName: 'template.json',
      extension: '.json',
      supportsBlocks: true,
    });
  });

  describe('resolveDiagnosticAnchorLine', () => {
    const anchorContent = [
      '{',
      '  "Resources": {}',
      '}',
      '',
      '// trailing',
    ].join('\n');

    it('covers all base anchor edge cases', () => {
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

  describe('listBlocks', () => {
    it('lists blocks and computes bounded line ranges', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/template.json',
        content: cloudFormationJson,
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
        header: 'AppQueue (AWS::SQS::Queue)',
      });
      expect(blocks[0].startLine).toBeLessThan(blocks[1].startLine);
      expect(blocks[0].endLine).toBe(blocks[1].startLine - 1);
    });

    it('returns empty for invalid JSON, missing resources, and empty resources', () => {
      expect(
        handler.listBlocks({
          filePath: '/workspace/t.json',
          content: '{ invalid',
        })
      ).toEqual([]);
      expect(
        handler.listBlocks({
          filePath: '/workspace/t.json',
          content: JSON.stringify({ AWSTemplateFormatVersion: '2010-09-09' }),
        })
      ).toEqual([]);
      expect(
        handler.listBlocks({
          filePath: '/workspace/t.json',
          content: JSON.stringify({ Resources: {} }),
        })
      ).toEqual([]);
    });

    it('returns resources in stable file order', () => {
      const content = JSON.stringify(
        {
          Resources: {
            A: { Type: 'AWS::S3::Bucket' },
            B: { Type: 'AWS::SNS::Topic' },
            C: { Type: 'AWS::SQS::Queue' },
          },
        },
        null,
        2
      );
      const blocks = handler.listBlocks({
        filePath: '/workspace/template.json',
        content,
      });
      expect(blocks.map(block => block.name)).toEqual(['A', 'B', 'C']);
    });
  });

  describe('findBlockAtLine and findNearestBlock', () => {
    it('finds block by interior line and nearest last block past end', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/template.json',
        content: cloudFormationJson,
      });

      const appQueue = handler.findBlockAtLine({
        filePath: '/workspace/template.json',
        content: cloudFormationJson,
        line: blocks[1].startLine,
      });
      const nearest = handler.findNearestBlock({
        filePath: '/workspace/template.json',
        content: cloudFormationJson,
        line: 10_000,
      });

      expect(appQueue?.name).toBe('AppQueue');
      expect(nearest?.name).toBe('AppQueue');
    });
  });

  describe('buildDiagnosticContext', () => {
    it('uses CloudFormation-prefixed fallback headers when no block exists', () => {
      const withBlock = handler.buildDiagnosticContext({
        filePath: '/workspace/template.json',
        content: cloudFormationJson,
        hint: { line: 1, filePath: '/workspace/template.json' },
      });
      const fallback = handler.buildDiagnosticContext({
        filePath: '/workspace/broken.json',
        content: '{ invalid',
        hint: { line: 4, filePath: '/workspace/broken.json' },
      });
      const emptyFallback = handler.buildDiagnosticContext({
        filePath: '/workspace/empty.json',
        content: '',
        hint: { line: 2, filePath: '/workspace/empty.json' },
      });

      expect(withBlock.blockHeader).toContain('App');
      expect(withBlock.fallbackBlock).toBe(false);

      expect(fallback.block).toBeUndefined();
      expect(fallback.nearestBlock).toBeUndefined();
      expect(fallback.diagnosticAnchorLine).toBe(4);
      expect(fallback.blockHeader).toBe('CloudFormation broken.json');
      expect(fallback.fallbackBlock).toBe(true);

      expect(emptyFallback.blockHeader).toBe('CloudFormation empty.json');
      expect(emptyFallback.fallbackBlock).toBe(true);
    });
  });
});

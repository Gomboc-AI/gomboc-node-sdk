import { BicepLanguageHandler } from './handler';

const bicepContent = [
  'param location string = resourceGroup().location',
  '',
  'var tags = {',
  "  environment: 'dev'",
  '}',
  '',
  "resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {",
  "  name: 'storacctdemo'",
  '  location: location',
  '}',
  '',
  'output endpoint string = storageAccount.properties.primaryEndpoints.blob',
].join('\n');

describe('BicepLanguageHandler', () => {
  const handler = new BicepLanguageHandler();

  it('detects .bicep files and ignores other extensions', () => {
    expect(
      handler.detectLanguage({
        filePath: '/workspace/main.bicep',
        content: bicepContent,
      })
    ).toBe(true);
    expect(
      handler.detectLanguage({
        filePath: '/workspace/main.tf',
        content: bicepContent,
      })
    ).toBe(false);
  });

  it('returns bicep document info metadata', () => {
    expect(
      handler.getDocumentInfo({
        filePath: '/workspace/main.bicep',
        content: bicepContent,
      })
    ).toMatchObject({
      languageId: 'bicep',
      extension: '.bicep',
      supportsBlocks: true,
      isConfigLike: true,
    });
  });

  describe('resolveDiagnosticAnchorLine', () => {
    const anchorContent = [
      "resource storage 'Microsoft.Storage/storageAccounts@2023' = {",
      "  name: 'demo'",
      '}',
      '',
      '# trailing',
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

  describe('listBlocks and line resolution', () => {
    it('parses all declaration kinds', () => {
      const fullDeclarations = [
        "param location string = 'eastus'",
        "var tags = { env: 'dev' }",
        "resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {",
        "  name: 'storacctdemo'",
        '}',
        "module network './network.bicep' = {",
        "  name: 'network'",
        '}',
        'output endpoint string = storageAccount.id',
      ].join('\n');
      const blocks = handler.listBlocks({
        filePath: '/workspace/main.bicep',
        content: fullDeclarations,
      });
      expect(blocks.find(block => block.type === 'bicep_param')?.name).toBe(
        'location'
      );
      expect(blocks.find(block => block.type === 'bicep_var')?.name).toBe(
        'tags'
      );
      expect(blocks.find(block => block.type === 'bicep_resource')?.name).toBe(
        'storageAccount'
      );
      expect(blocks.find(block => block.type === 'bicep_module')?.name).toBe(
        'network'
      );
      expect(blocks.find(block => block.type === 'bicep_output')?.name).toBe(
        'endpoint'
      );
    });

    it('captures multiline resource block ranges', () => {
      const multiline = [
        "resource sa 'Microsoft.Storage/storageAccounts@2023' = {",
        "  name: 'demo'",
        '  properties: {',
        "    accessTier: 'Hot'",
        '  }',
        '}',
      ].join('\n');
      const blocks = handler.listBlocks({
        filePath: '/workspace/main.bicep',
        content: multiline,
      });
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({ startLine: 1, endLine: 6 });
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/main.bicep',
          content: multiline,
          line: 4,
        })?.name
      ).toBe('sa');
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/main.bicep',
          content: multiline,
          line: 7,
        })
      ).toBeNull();
    });

    it('keeps inline declarations as single-line blocks', () => {
      const inline = ["param env string = 'dev'", "var prefix = 'demo'"].join(
        '\n'
      );
      const blocks = handler.listBlocks({
        filePath: '/workspace/main.bicep',
        content: inline,
      });
      expect(blocks).toHaveLength(2);
      expect(blocks[0].startLine).toBe(blocks[0].endLine);
      expect(blocks[1].startLine).toBe(blocks[1].endLine);
    });
  });

  describe('detectLanguage', () => {
    it('accepts bicep and rejects non-bicep extensions', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/main.bicep',
          content: '',
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({ filePath: '/workspace/main.tf', content: '' })
      ).toBe(false);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/main.yaml',
          content: '',
        })
      ).toBe(false);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/main.json',
          content: '',
        })
      ).toBe(false);
    });
  });
});

import { DockerfileLanguageHandler } from './handler';

const dockerContent = [
  'FROM node:20 AS base',
  'WORKDIR /app',
  '',
  'FROM base AS build',
  'RUN npm ci',
].join('\n');

describe('DockerfileLanguageHandler', () => {
  const handler = new DockerfileLanguageHandler();

  it('returns dockerfile document info metadata', () => {
    expect(
      handler.getDocumentInfo({
        filePath: '/workspace/Dockerfile',
        content: dockerContent,
      })
    ).toMatchObject({
      languageId: 'dockerfile',
      fileName: 'Dockerfile',
      supportsBlocks: true,
    });
  });

  describe('resolveDiagnosticAnchorLine', () => {
    const anchorContent = [
      'FROM node:20 AS base',
      'RUN npm ci',
      '',
      '# trailing comment',
    ].join('\n');

    it('covers fix-operation and add/no-op anchor behavior', () => {
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
      ).toEqual({ line: 4, character: 0 });
      expect(
        handler.resolveDiagnosticAnchorLine({
          content: anchorContent,
          suggestedLine: 3,
          fromFixOperation: false,
        })
      ).toEqual({ line: 2, character: 0 });
    });

    it('normalizes invalid suggested lines', () => {
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
          suggestedLine: 2.9,
          fromFixOperation: true,
        })
      ).toEqual({ line: 2, character: 0 });
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

  describe('listBlocks', () => {
    it('lists docker stages with bounded ranges', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/Dockerfile',
        content: dockerContent,
      });
      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toMatchObject({
        type: 'docker_stage',
        name: 'base',
        startLine: 1,
        endLine: 3,
      });
      expect(blocks[1]).toMatchObject({
        type: 'docker_stage',
        name: 'build',
        startLine: 4,
      });
    });

    it('returns empty for files without FROM instructions', () => {
      expect(
        handler.listBlocks({
          filePath: '/workspace/Dockerfile',
          content: 'RUN echo "hello"',
        })
      ).toEqual([]);
      expect(
        handler.listBlocks({ filePath: '/workspace/Dockerfile', content: '' })
      ).toEqual([]);
    });

    it('parses mixed-case FROM/AS and stage names without aliases', () => {
      const content = [
        'from --platform=linux/amd64 node:20 as base',
        'RUN npm ci',
        '',
        'FROM alpine:3.20',
        'RUN echo done',
      ].join('\n');
      const blocks = handler.listBlocks({
        filePath: '/workspace/Dockerfile',
        content,
      });
      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toMatchObject({
        name: 'base',
        startLine: 1,
        endLine: 3,
      });
      expect(blocks[1]).toMatchObject({
        name: 'alpine:3.20',
        startLine: 4,
        endLine: 5,
      });
    });
  });

  describe('findBlockAtLine and findNearestBlock', () => {
    it('finds containing stage on boundaries and in gaps', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/Dockerfile',
          content: dockerContent,
          line: 1,
        })?.name
      ).toBe('base');
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/Dockerfile',
          content: dockerContent,
          line: 3,
        })?.name
      ).toBe('base');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/Dockerfile',
          content: dockerContent,
          line: 100,
        })?.name
      ).toBe('build');
    });

    it('normalizes non-positive line numbers', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/Dockerfile',
          content: dockerContent,
          line: 0,
        })?.name
      ).toBe('base');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/Dockerfile',
          content: dockerContent,
          line: -1,
        })?.name
      ).toBe('base');
    });
  });

  it('builds context with fallback when stage not found', () => {
    const withBlock = handler.buildDiagnosticContext({
      filePath: '/workspace/Dockerfile',
      content: dockerContent,
      hint: { line: 2, filePath: '/workspace/Dockerfile' },
    });
    const fallback = handler.buildDiagnosticContext({
      filePath: '/workspace/Dockerfile',
      content: 'RUN echo hello',
      hint: { line: 1, filePath: '/workspace/Dockerfile' },
    });
    expect(withBlock.block?.name).toBe('base');
    expect(withBlock.fallbackBlock).toBe(false);
    expect(fallback.block).toBeUndefined();
    expect(fallback.fallbackBlock).toBe(true);
  });

  it('has docker codeResourceType', () => {
    expect(handler.codeResourceType).toBe('docker');
  });

  it('detectLanguage matches Dockerfile naming variants', () => {
    expect(
      handler.detectLanguage({
        filePath: '/workspace/Dockerfile',
        content: dockerContent,
      })
    ).toBe(true);
    expect(
      handler.detectLanguage({
        filePath: '/workspace/Dockerfile.prod',
        content: dockerContent,
      })
    ).toBe(true);
    expect(
      handler.detectLanguage({
        filePath: '/workspace/build.dockerfile',
        content: dockerContent,
      })
    ).toBe(true);
    expect(
      handler.detectLanguage({
        filePath: '/workspace/docker.yaml',
        content: dockerContent,
      })
    ).toBe(false);
  });

  it('formatBlockDisplayName uses Docker Stage format', () => {
    expect(
      handler.formatBlockDisplayName({
        blockType: 'docker_stage',
        blockName: 'build',
        filePath: '/workspace/Dockerfile',
      })
    ).toBe('Docker Stage: build');

    expect(
      handler.formatBlockDisplayName({
        blockType: 'docker_stage',
        blockName: null,
        filePath: '/workspace/Dockerfile',
      })
    ).toBe('Docker Stage');
  });
});

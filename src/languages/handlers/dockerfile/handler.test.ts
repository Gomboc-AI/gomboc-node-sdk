import { DockerfileLanguageHandler } from './handler';

const handler = new DockerfileLanguageHandler();
const filePath = '/workspace/Dockerfile';

const multistage = [
  'FROM node:20 AS base',
  'WORKDIR /app',
  '',
  'FROM base AS build',
  'RUN npm ci',
].join('\n');

const singleStageNoAlias = ['FROM ubuntu:22.04', 'RUN apt-get update'].join(
  '\n'
);

const withPlatform = [
  'FROM --platform=linux/amd64 node:20 AS builder',
  'COPY . .',
  'FROM node:20-alpine AS runner',
  'CMD ["node", "server.js"]',
].join('\n');

const commentsAndBlanks = [
  '# syntax=docker/dockerfile:1',
  '',
  '# Base stage',
  'FROM node:20 AS base',
  '# Install deps',
  'RUN npm ci',
].join('\n');

const noFromLines = ['RUN echo hello', 'ENV NODE_ENV=production'].join('\n');

const emptyFile = '';

describe('DockerfileLanguageHandler', () => {
  describe('detectLanguage', () => {
    it('matches Dockerfile by filename', () => {
      expect(
        handler.detectLanguage({ filePath: '/workspace/Dockerfile', content: '' })
      ).toBe(true);
    });

    it('matches Dockerfile.dev and Dockerfile.production variants', () => {
      expect(
        handler.detectLanguage({ filePath: '/workspace/Dockerfile.dev', content: '' })
      ).toBe(true);
      expect(
        handler.detectLanguage({ filePath: '/workspace/Dockerfile.production', content: '' })
      ).toBe(true);
    });

    it('matches .dockerfile extension', () => {
      expect(
        handler.detectLanguage({ filePath: '/workspace/app.dockerfile', content: '' })
      ).toBe(true);
    });

    it('rejects non-dockerfile files', () => {
      expect(
        handler.detectLanguage({ filePath: '/workspace/docker-compose.yml', content: '' })
      ).toBe(false);
      expect(
        handler.detectLanguage({ filePath: '/workspace/package.json', content: '' })
      ).toBe(false);
      expect(
        handler.detectLanguage({ filePath: '/workspace/tsconfig.json', content: '' })
      ).toBe(false);
    });
  });

  describe('listBlocks', () => {
    it('parses multi-stage build into two non-overlapping blocks', () => {
      const blocks = handler.listBlocks({ filePath, content: multistage });
      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toMatchObject({
        type: 'docker_stage',
        name: 'base',
        startLine: 1,
        endLine: 3,
        header: 'FROM base',
      });
      expect(blocks[1]).toMatchObject({
        type: 'docker_stage',
        name: 'build',
        startLine: 4,
        endLine: 5,
        header: 'FROM build',
      });
    });

    it('uses image name as block name when no AS alias is given', () => {
      const blocks = handler.listBlocks({ filePath, content: singleStageNoAlias });
      expect(blocks).toHaveLength(1);
      expect(blocks[0].name).toBe('ubuntu:22.04');
      expect(blocks[0].startLine).toBe(1);
      expect(blocks[0].endLine).toBe(2);
    });

    it('correctly skips --platform flag when parsing FROM', () => {
      const blocks = handler.listBlocks({ filePath, content: withPlatform });
      expect(blocks).toHaveLength(2);
      expect(blocks[0].name).toBe('builder');
      expect(blocks[1].name).toBe('runner');
    });

    it('ignores comment and blank lines — only FROM lines create blocks', () => {
      const blocks = handler.listBlocks({ filePath, content: commentsAndBlanks });
      expect(blocks).toHaveLength(1);
      expect(blocks[0].name).toBe('base');
    });

    it('returns empty array when no FROM instructions exist', () => {
      expect(
        handler.listBlocks({ filePath, content: noFromLines })
      ).toHaveLength(0);
    });

    it('returns empty array for empty file', () => {
      expect(
        handler.listBlocks({ filePath, content: emptyFile })
      ).toHaveLength(0);
    });
  });

  describe('findBlockAtLine', () => {
    it('returns the containing stage for any line within it', () => {
      expect(
        handler.findBlockAtLine({ filePath, content: multistage, line: 1 })?.name
      ).toBe('base');
      expect(
        handler.findBlockAtLine({ filePath, content: multistage, line: 2 })?.name
      ).toBe('base');
      expect(
        handler.findBlockAtLine({ filePath, content: multistage, line: 5 })?.name
      ).toBe('build');
    });

    it('assigns the blank line between stages to the preceding stage', () => {
      expect(
        handler.findBlockAtLine({ filePath, content: multistage, line: 3 })?.name
      ).toBe('base');
    });

    it('returns the second stage when on its FROM line', () => {
      expect(
        handler.findBlockAtLine({ filePath, content: multistage, line: 4 })?.name
      ).toBe('build');
    });

    it('returns null when no stages exist', () => {
      expect(
        handler.findBlockAtLine({ filePath, content: noFromLines, line: 1 })
      ).toBeNull();
    });
  });

  describe('findNearestBlock', () => {
    it('returns the last block when line is past end of file', () => {
      expect(
        handler.findNearestBlock({ filePath, content: multistage, line: 999 })?.name
      ).toBe('build');
    });

    it('returns the first block when line is before any stage', () => {
      const blocks = handler.listBlocks({ filePath, content: commentsAndBlanks });
      expect(
        handler.findNearestBlock({
          filePath,
          content: commentsAndBlanks,
          line: 1,
        })?.name
      ).toBe(blocks[0].name);
    });

    it('returns null when no stages exist', () => {
      expect(
        handler.findNearestBlock({ filePath, content: noFromLines, line: 1 })
      ).toBeNull();
    });
  });

  describe('resolveDiagnosticAnchorLine', () => {
    it('returns the exact suggested line when it exists in the file', () => {
      expect(
        handler.resolveDiagnosticAnchorLine({
          content: multistage,
          suggestedLine: 2,
          fromFixOperation: false,
        })
      ).toBe(2);
    });

    it('does not snap to the FROM line — returns the body line directly', () => {
      const result = handler.resolveDiagnosticAnchorLine({
        content: multistage,
        suggestedLine: 5,
        fromFixOperation: false,
      });
      expect(result).toBe(5);
      expect(result).not.toBe(4);
    });

    it('clamps to last line of file for insertion past EOF', () => {
      const lines = multistage.split('\n').length;
      const result = handler.resolveDiagnosticAnchorLine({
        content: multistage,
        suggestedLine: lines + 10,
        fromFixOperation: false,
      });
      expect(result).toBe(lines);
    });

    it('returns 1 for empty file', () => {
      expect(
        handler.resolveDiagnosticAnchorLine({
          content: emptyFile,
          suggestedLine: 5,
          fromFixOperation: false,
        })
      ).toBe(1);
    });

    it('returns 1 when no content provided', () => {
      expect(
        handler.resolveDiagnosticAnchorLine({
          content: '',
          suggestedLine: 3,
          fromFixOperation: false,
        })
      ).toBe(1);
    });
  });

  describe('buildDiagnosticRange', () => {
    it('highlights the full FROM instruction — not capped at 24 chars', () => {
      const line = 'FROM node:20-alpine AS builder';
      const result = handler.buildDiagnosticRange({
        line1Based: 1,
        content: line,
      });
      expect(result.startChar).toBe(0);
      expect(result.endChar).toBe(line.length);
    });

    it('starts at first non-whitespace for indented lines', () => {
      const result = handler.buildDiagnosticRange({
        line1Based: 1,
        content: '  RUN npm ci',
      });
      expect(result.startChar).toBe(2);
    });

    it('covers a short instruction fully', () => {
      const line = 'RUN npm ci';
      const result = handler.buildDiagnosticRange({
        line1Based: 1,
        content: line,
      });
      expect(result.endChar).toBe(line.length);
    });
  });

  describe('buildDiagnosticContext', () => {
    it('finds the containing stage and sets fallbackBlock false', () => {
      const ctx = handler.buildDiagnosticContext({
        filePath,
        content: multistage,
        hint: { line: 2, filePath },
      });
      expect(ctx.block?.name).toBe('base');
      expect(ctx.fallbackBlock).toBe(false);
      expect(ctx.blockHeader).toBe('FROM base');
    });

    it('sets fallbackBlock true and uses filename when no stages exist', () => {
      const ctx = handler.buildDiagnosticContext({
        filePath,
        content: noFromLines,
        hint: { line: 1, filePath },
      });
      expect(ctx.block).toBeUndefined();
      expect(ctx.fallbackBlock).toBe(true);
      expect(ctx.blockHeader).toBe('Dockerfile');
    });
  });

  describe('getDocumentInfo', () => {
    it('returns correct metadata', () => {
      expect(
        handler.getDocumentInfo({ filePath, content: multistage })
      ).toMatchObject({
        languageId: 'dockerfile',
        fileName: 'Dockerfile',
        isConfigLike: true,
        supportsBlocks: true,
      });
    });
  });

  describe('metadata', () => {
    it('has docker codeResourceType', () => {
      expect(handler.codeResourceType).toBe('docker');
    });

    it('returns dockerfile resource context extract kind', () => {
      expect(handler.getResourceContextExtractKind()).toBe('dockerfile');
    });

    it('formats block display name with and without alias', () => {
      expect(
        handler.formatBlockDisplayName({
          blockType: 'docker_stage',
          blockName: 'build',
          filePath,
        })
      ).toBe('Docker Stage: build');

      expect(
        handler.formatBlockDisplayName({
          blockType: 'docker_stage',
          blockName: null,
          filePath,
        })
      ).toBe('Docker Stage');
    });
  });
});

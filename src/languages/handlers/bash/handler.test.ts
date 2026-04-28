import { BashLanguageHandler } from './handler';

const bashContent = [
  '#!/usr/bin/env bash',
  'set -euo pipefail',
  '',
  'build() {',
  '  echo "building"',
  '}',
  '',
  'function deploy {',
  '  build',
  '}',
].join('\n');

describe('BashLanguageHandler', () => {
  const handler = new BashLanguageHandler();

  describe('detectLanguage', () => {
    it('detects bash extensions and ignores non-bash extensions', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/script.sh',
          content: bashContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/script.bash',
          content: bashContent,
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/script.py',
          content: 'print("hello")',
        })
      ).toBe(false);
    });

    it('detects bash by shebang and remains extension-case safe', () => {
      expect(
        handler.detectLanguage({
          filePath: '/workspace/run',
          content: ['#!/bin/bash', 'echo ok'].join('\n'),
        })
      ).toBe(true);
      expect(
        handler.detectLanguage({
          filePath: '/workspace/SCRIPT.SH',
          content: 'echo ok',
        })
      ).toBe(true);
    });
  });

  describe('getDocumentInfo', () => {
    it('returns bash document metadata', () => {
      expect(
        handler.getDocumentInfo({
          filePath: '/workspace/script.sh',
          content: bashContent,
        })
      ).toMatchObject({
        languageId: 'bash',
        fileName: 'script.sh',
        extension: '.sh',
        supportsBlocks: true,
        isConfigLike: false,
      });
    });
  });

  describe('listBlocks', () => {
    it('parses function blocks from bash fixtures', () => {
      const blocks = handler.listBlocks({
        filePath: '/workspace/script.sh',
        content: bashContent,
      });
      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toMatchObject({
        type: 'bash_function',
        name: 'build',
        startLine: 4,
        endLine: 6,
        header: 'function build',
      });
      expect(blocks[1]).toMatchObject({
        type: 'bash_function',
        name: 'deploy',
        startLine: 8,
        endLine: 10,
        header: 'function deploy',
      });
    });

    it('returns empty for empty files and files without functions', () => {
      expect(
        handler.listBlocks({ filePath: '/workspace/script.sh', content: '' })
      ).toEqual([]);
      expect(
        handler.listBlocks({
          filePath: '/workspace/script.sh',
          content: ['echo hello', 'pwd'].join('\n'),
        })
      ).toEqual([]);
    });
  });

  describe('findBlockAtLine', () => {
    it('returns containing block at boundaries and null in gaps', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/script.sh',
          content: bashContent,
          line: 4,
        })?.name
      ).toBe('build');
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/script.sh',
          content: bashContent,
          line: 6,
        })?.name
      ).toBe('build');
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/script.sh',
          content: bashContent,
          line: 7,
        })
      ).toBeNull();
    });

    it('treats non-positive lines as line 1', () => {
      expect(
        handler.findBlockAtLine({
          filePath: '/workspace/script.sh',
          content: bashContent,
          line: 0,
        })
      ).toBeNull();
    });
  });

  describe('findNearestBlock', () => {
    it('returns first block before file, previous in gaps, and last after file', () => {
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/script.sh',
          content: bashContent,
          line: 1,
        })?.name
      ).toBe('build');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/script.sh',
          content: bashContent,
          line: 7,
        })?.name
      ).toBe('build');
      expect(
        handler.findNearestBlock({
          filePath: '/workspace/script.sh',
          content: bashContent,
          line: 99,
        })?.name
      ).toBe('deploy');
    });
  });

  describe('resolveDiagnosticAnchorLine', () => {
    const anchorContent = [
      'build() {',
      '  echo "build"',
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
          suggestedLine: 4,
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

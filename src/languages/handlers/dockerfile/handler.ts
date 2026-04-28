import path from 'path';
import {
  DetectLanguageArgs,
  DocumentInfo,
  FindNearestBlockArgs,
  FindBlockAtLineArgs,
  FormatBlockDisplayNameArgs,
  GetDocumentInfoArgs,
  ListBlocksArgs,
  BlockRange,
  BuildDiagnosticRangeArgs,
  DiagnosticRangeResult,
  ResolveDiagnosticAnchorLineArgs,
  ResourceContextExtractKind,
} from '../../types';
import { BaseLanguageHandler } from '../base';

export class DockerfileLanguageHandler extends BaseLanguageHandler {
  displayName = 'Dockerfile';
  codeResourceType = 'docker';
  extensions = ['Dockerfile', '.dockerfile'];

  detectLanguage(args: DetectLanguageArgs): boolean {
    const fileName = path.basename(args.filePath || '').toLowerCase();
    const ext = path.extname(args.filePath || '').toLowerCase();
    return fileName.startsWith('dockerfile') || ext === '.dockerfile';
  }

  override getResourceContextExtractKind(): ResourceContextExtractKind {
    return 'dockerfile';
  }

  override formatBlockDisplayName(args: FormatBlockDisplayNameArgs): string {
    if (args.blockName?.trim()) {
      return `Docker Stage: ${args.blockName}`;
    }
    return 'Docker Stage';
  }

  /**
   * Parses Docker build stages (`FROM ... [AS name]`) into line ranges.
   */
  private parseBlocks(content: string): BlockRange[] {
    const lines = content.split('\n');
    const blocks: BlockRange[] = [];
    const fromPattern =
      /^FROM\s+(?:--[^\s]+\s+)?([^\s]+(?::[^\s]+)?)(?:\s+AS\s+(\S+))?/i;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      const fromMatch = trimmed.match(fromPattern);
      if (!fromMatch) {
        continue;
      }

      const image = fromMatch[1];
      const alias = fromMatch[2];
      const display = alias || image;
      let endLine = lines.length;
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].trim();
        if (!next || next.startsWith('#')) {
          continue;
        }
        if (fromPattern.test(next)) {
          endLine = j;
          break;
        }
      }

      blocks.push({
        type: 'docker_stage',
        name: display,
        startLine: i + 1,
        endLine,
        header: `FROM ${display}`,
      });
    }

    return blocks;
  }

  getDocumentInfo(args: GetDocumentInfoArgs): DocumentInfo {
    const ext = path.extname(args.filePath).toLowerCase();
    const fileName = path.basename(args.filePath);
    return {
      languageId: 'dockerfile',
      filePath: args.filePath,
      fileName,
      extension: ext,
      isConfigLike: true,
      supportsBlocks: true,
    };
  }

  findBlockAtLine(args: FindBlockAtLineArgs): BlockRange | null {
    const blocks = this.parseBlocks(args.content);
    const line = Math.max(1, args.line);
    return (
      blocks.find(block => line >= block.startLine && line <= block.endLine) ||
      null
    );
  }

  findNearestBlock(args: FindNearestBlockArgs): BlockRange | null {
    const blocks = this.parseBlocks(args.content);
    if (blocks.length === 0) {
      return null;
    }
    const line = Math.max(1, args.line);
    const containing = blocks.find(
      block => line >= block.startLine && line <= block.endLine
    );
    if (containing) {
      return containing;
    }
    const previous = blocks
      .filter(block => block.startLine <= line)
      .sort((a, b) => b.startLine - a.startLine)[0];
    return previous || blocks[0];
  }

  listBlocks(args: ListBlocksArgs): BlockRange[] {
    return this.parseBlocks(args.content);
  }

  override resolveDiagnosticAnchorLine(
    args: ResolveDiagnosticAnchorLineArgs
  ): number {
    const suggested =
      Number.isFinite(args.suggestedLine) && args.suggestedLine > 0
        ? Math.floor(args.suggestedLine)
        : 1;
    const maxLine = Math.max(1, (args.content ?? '').split('\n').length);
    return Math.min(maxLine, Math.max(1, suggested));
  }

  override buildDiagnosticRange(
    args: BuildDiagnosticRangeArgs
  ): DiagnosticRangeResult {
    const line = Math.max(1, Math.floor(args.line1Based || 1));
    const text = typeof args.content === 'string' ? args.content : '';
    const lines = text.split('\n');
    const idx = Math.min(Math.max(0, line - 1), Math.max(0, lines.length - 1));
    const lineText = lines[idx] || '';
    const firstNonWhitespace = lineText.search(/\S/);
    const startChar = firstNonWhitespace >= 0 ? firstNonWhitespace : 0;
    const endChar = Math.max(startChar + 1, lineText.trimEnd().length);
    return { startChar, endChar };
  }
}

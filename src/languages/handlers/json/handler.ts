import path from 'path';
import {
  BlockRange,
  DetectLanguageArgs,
  DocumentInfo,
  FindBlockAtLineArgs,
  FindNearestBlockArgs,
  GetDocumentInfoArgs,
  ListBlocksArgs,
  ResourceContextExtractKind,
} from '../../types';
import { BaseLanguageHandler } from '../base';

export class JsonLanguageHandler extends BaseLanguageHandler {
  displayName = 'JSON';
  codeResourceType = 'json';
  extensions = ['.json'];

  public detectLanguage(args: DetectLanguageArgs): boolean {
    const ext = path.extname(args.filePath || '').toLowerCase();
    return this.extensions.includes(ext);
  }

  public override getResourceContextExtractKind(): ResourceContextExtractKind {
    return 'json';
  }

  /**
   * Parses top-level JSON object properties into line-bounded block ranges.
   */
  private parseBlocks(content: string): BlockRange[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return [];
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return [];
    }

    const entries = Object.entries(parsed as Record<string, unknown>);
    if (entries.length === 0) {
      return [];
    }

    const lines = content.split('\n');
    const escapeRegex = (value: string): string =>
      value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const blocks: BlockRange[] = [];

    for (const [key] of entries) {
      const keyPattern = new RegExp(`^\\s*"${escapeRegex(key)}"\\s*:`);
      const startLine = Math.max(
        1,
        lines.findIndex(line => keyPattern.test(line)) + 1
      );
      blocks.push({
        type: 'json_property',
        name: key,
        startLine,
        endLine: lines.length,
        header: `"${key}"`,
      });
    }

    blocks.sort((a, b) => a.startLine - b.startLine);
    for (let i = 0; i < blocks.length; i++) {
      const next = blocks[i + 1];
      blocks[i].endLine = next
        ? Math.max(blocks[i].startLine, next.startLine - 1)
        : lines.length;
    }

    return blocks;
  }

  public getDocumentInfo(args: GetDocumentInfoArgs): DocumentInfo {
    const ext = path.extname(args.filePath).toLowerCase();
    const fileName = path.basename(args.filePath);
    return {
      languageId: 'json',
      filePath: args.filePath,
      fileName,
      extension: ext,
      isConfigLike: true,
      supportsBlocks: true,
    };
  }

  public findBlockAtLine(args: FindBlockAtLineArgs): BlockRange | null {
    const blocks = this.parseBlocks(args.content);
    const line = Math.max(1, args.line);
    const containing = blocks.find(
      block => line >= block.startLine && line <= block.endLine
    );
    return containing || null;
  }

  public findNearestBlock(args: FindNearestBlockArgs): BlockRange | null {
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

  public listBlocks(args: ListBlocksArgs): BlockRange[] {
    return this.parseBlocks(args.content);
  }
}

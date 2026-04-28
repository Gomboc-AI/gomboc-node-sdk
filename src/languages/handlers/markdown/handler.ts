import path from 'path';
import {
  BlockRange,
  DetectLanguageArgs,
  DocumentInfo,
  FindBlockAtLineArgs,
  FindNearestBlockArgs,
  GetDocumentInfoArgs,
  ListBlocksArgs,
} from '../../types';
import { BaseLanguageHandler } from '../base';

export class MarkdownLanguageHandler extends BaseLanguageHandler {
  displayName = 'Markdown';
  codeResourceType = 'markdown';
  extensions = ['.md', '.markdown'];

  public detectLanguage(args: DetectLanguageArgs): boolean {
    const ext = path.extname(args.filePath || '').toLowerCase();
    return this.extensions.includes(ext);
  }

  /**
   * Parses markdown headings and fenced code blocks into line ranges.
   */
  private parseBlocks(content: string): BlockRange[] {
    const lines = content.split('\n');
    const blocks: BlockRange[] = [];

    const headings: BlockRange[] = [];
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^(#{1,6})\s+(.+?)\s*$/);
      if (!match) {
        continue;
      }
      const level = match[1].length;
      const title = match[2].trim();
      headings.push({
        type: `markdown_h${level}`,
        name: title,
        startLine: i + 1,
        endLine: lines.length,
        header: `${'#'.repeat(level)} ${title}`,
      });
    }
    for (let i = 0; i < headings.length; i++) {
      const next = headings[i + 1];
      headings[i].endLine = next
        ? Math.max(headings[i].startLine, next.startLine - 1)
        : lines.length;
    }
    blocks.push(...headings);

    for (let i = 0; i < lines.length; i++) {
      const open = lines[i].match(/^```([A-Za-z0-9_-]+)?\s*$/);
      if (!open) {
        continue;
      }
      const fenceLang = (open[1] || '').trim();
      let endLine = lines.length;
      let closeIndex = -1;
      for (let j = i + 1; j < lines.length; j++) {
        if (/^```\s*$/.test(lines[j])) {
          endLine = j + 1;
          closeIndex = j;
          break;
        }
      }
      blocks.push({
        type: 'markdown_fence',
        name: fenceLang || undefined,
        startLine: i + 1,
        endLine,
        header: fenceLang ? `code block (${fenceLang})` : 'code block',
      });
      if (closeIndex >= 0) {
        i = closeIndex;
      } else {
        break;
      }
    }

    blocks.sort((a, b) => {
      if (a.startLine !== b.startLine) {
        return a.startLine - b.startLine;
      }
      return a.endLine - b.endLine;
    });
    return blocks;
  }

  public getDocumentInfo(args: GetDocumentInfoArgs): DocumentInfo {
    const ext = path.extname(args.filePath).toLowerCase();
    const fileName = path.basename(args.filePath);
    return {
      languageId: 'markdown',
      filePath: args.filePath,
      fileName,
      extension: ext,
      isConfigLike: false,
      supportsBlocks: true,
    };
  }

  public findBlockAtLine(args: FindBlockAtLineArgs): BlockRange | null {
    const blocks = this.parseBlocks(args.content);
    const line = Math.max(1, args.line);
    const containing = blocks.filter(
      block => line >= block.startLine && line <= block.endLine
    );
    if (containing.length === 0) {
      return null;
    }
    containing.sort((a, b) => {
      if (a.startLine !== b.startLine) {
        return b.startLine - a.startLine;
      }
      return a.endLine - b.endLine;
    });
    return containing[0];
  }

  public findNearestBlock(args: FindNearestBlockArgs): BlockRange | null {
    const blocks = this.parseBlocks(args.content);
    if (blocks.length === 0) {
      return null;
    }
    const line = Math.max(1, args.line);
    const containing = blocks.filter(
      block => line >= block.startLine && line <= block.endLine
    );
    if (containing.length > 0) {
      containing.sort((a, b) => {
        if (a.startLine !== b.startLine) {
          return b.startLine - a.startLine;
        }
        return a.endLine - b.endLine;
      });
      return containing[0];
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

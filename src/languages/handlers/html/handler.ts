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

export class HtmlLanguageHandler extends BaseLanguageHandler {
  displayName = 'HTML';
  codeResourceType = 'html';
  extensions = ['.html', '.htm'];

  public detectLanguage(args: DetectLanguageArgs): boolean {
    const ext = path.extname(args.filePath || '').toLowerCase();
    return this.extensions.includes(ext);
  }

  /**
   * Parses HTML opening/closing tags into nested block ranges.
   */
  private parseBlocks(content: string): BlockRange[] {
    const lines = content.split('\n');
    const blocks: BlockRange[] = [];
    const stack: Array<{ tag: string; startLine: number; header: string }> = [];
    const tagPattern = /<\/?([A-Za-z][A-Za-z0-9-]*)\b[^>]*>/g;
    const selfClosingTags = new Set([
      'br',
      'hr',
      'img',
      'input',
      'meta',
      'link',
      'source',
      'area',
      'base',
      'col',
      'embed',
      'param',
      'track',
      'wbr',
    ]);

    for (let i = 0; i < lines.length; i++) {
      const lineNumber = i + 1;
      const line = lines[i];
      let match: RegExpExecArray | null;

      while ((match = tagPattern.exec(line)) !== null) {
        const raw = match[0];
        const tag = match[1].toLowerCase();
        const isClosing = raw.startsWith('</');
        const isSelfClosing = raw.endsWith('/>') || selfClosingTags.has(tag);
        if (raw.startsWith('<!--') || raw.startsWith('<!DOCTYPE')) {
          continue;
        }

        if (isClosing) {
          let openIndex = -1;
          for (let s = stack.length - 1; s >= 0; s--) {
            if (stack[s].tag === tag) {
              openIndex = s;
              break;
            }
          }
          if (openIndex >= 0) {
            const opened = stack.splice(openIndex, 1)[0];
            blocks.push({
              type: 'html_element',
              name: opened.tag,
              startLine: opened.startLine,
              endLine: lineNumber,
              header: opened.header,
            });
          }
          continue;
        }

        if (isSelfClosing) {
          blocks.push({
            type: 'html_element',
            name: tag,
            startLine: lineNumber,
            endLine: lineNumber,
            header: `<${tag}/>`,
          });
          continue;
        }

        stack.push({
          tag,
          startLine: lineNumber,
          header: `<${tag}>`,
        });
      }
    }

    while (stack.length > 0) {
      const opened = stack.pop()!;
      blocks.push({
        type: 'html_element',
        name: opened.tag,
        startLine: opened.startLine,
        endLine: lines.length || 1,
        header: opened.header,
      });
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
      languageId: 'html',
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

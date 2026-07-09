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

/** @deprecated Not needed anymore; handled by ORL itself. */
export class GoTemplateLanguageHandler extends BaseLanguageHandler {
  displayName = 'Go Template';
  codeResourceType = 'gotemplate';
  extensions = ['.tmpl', '.gotmpl', '.tpl'];

  public detectLanguage(args: DetectLanguageArgs): boolean {
    const filePath = args.filePath || '';
    const ext = path.extname(filePath).toLowerCase();
    if (this.extensions.includes(ext)) {
      return true;
    }
    const content = args.content || '';
    return /\{\{\s*[-]?\s*(define|if|range|with|block|template)\b/.test(
      content
    );
  }

  /**
   * Parses Go template define/control blocks using template action nesting.
   */
  private parseBlocks(content: string): BlockRange[] {
    const lines = content.split('\n');
    const blocks: BlockRange[] = [];
    const stack: Array<{
      startLine: number;
      type: string;
      name?: string;
      header: string;
      action: string;
    }> = [];

    for (let i = 0; i < lines.length; i++) {
      const lineNumber = i + 1;
      const line = lines[i];
      const actionPattern =
        /\{\{\s*[-]?\s*([A-Za-z_][A-Za-z0-9_]*)\b([^}]*)\}\}/g;
      let match: RegExpExecArray | null;

      while ((match = actionPattern.exec(line)) !== null) {
        const action = match[1];
        const rest = (match[2] || '').trim();

        if (action === 'define' || action === 'block') {
          const nameMatch = rest.match(/["']([^"']+)["']/);
          const name = nameMatch?.[1];
          stack.push({
            startLine: lineNumber,
            type: 'gotemplate_define',
            name,
            header: name ? `${action} "${name}"` : action,
            action,
          });
          continue;
        }

        if (action === 'if' || action === 'range' || action === 'with') {
          stack.push({
            startLine: lineNumber,
            type: 'gotemplate_control',
            name: action,
            header: action,
            action,
          });
          continue;
        }

        if (action === 'end') {
          const opened = stack.pop();
          if (!opened) {
            continue;
          }
          blocks.push({
            type: opened.type,
            name: opened.name,
            startLine: opened.startLine,
            endLine: lineNumber,
            header: opened.header,
          });
        }
      }
    }

    while (stack.length > 0) {
      const opened = stack.pop()!;
      blocks.push({
        type: opened.type,
        name: opened.name,
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
      languageId: 'gotemplate',
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

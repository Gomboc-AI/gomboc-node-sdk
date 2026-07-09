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
export class TomlLanguageHandler extends BaseLanguageHandler {
  displayName = 'TOML';
  codeResourceType = 'toml';
  extensions = ['.toml'];

  public detectLanguage(args: DetectLanguageArgs): boolean {
    const ext = path.extname(args.filePath || '').toLowerCase();
    return this.extensions.includes(ext);
  }

  /**
   * Parses TOML table/array-of-table headers and assigns line ranges per section.
   */
  private parseBlocks(content: string): BlockRange[] {
    const lines = content.split('\n');
    const starts: {
      line: number;
      header: string;
      name?: string;
      type: string;
    }[] = [];
    const tablePattern = /^\s*\[([^\]]+)\]\s*$/;
    const arrayTablePattern = /^\s*\[\[([^\]]+)\]\]\s*$/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const arrayMatch = line.match(arrayTablePattern);
      if (arrayMatch) {
        starts.push({
          line: i + 1,
          header: line.trim(),
          name: arrayMatch[1].trim(),
          type: 'toml_array_table',
        });
        continue;
      }
      const tableMatch = line.match(tablePattern);
      if (tableMatch) {
        starts.push({
          line: i + 1,
          header: line.trim(),
          name: tableMatch[1].trim(),
          type: 'toml_table',
        });
      }
    }

    return starts.map((entry, idx) => {
      const next = starts[idx + 1];
      return {
        type: entry.type,
        name: entry.name,
        startLine: entry.line,
        endLine: next ? next.line - 1 : lines.length,
        header: entry.header,
      };
    });
  }

  public getDocumentInfo(args: GetDocumentInfoArgs): DocumentInfo {
    const ext = path.extname(args.filePath).toLowerCase();
    const fileName = path.basename(args.filePath);
    return {
      languageId: 'toml',
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

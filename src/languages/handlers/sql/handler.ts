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

export class SqlLanguageHandler extends BaseLanguageHandler {
  displayName = 'SQL';
  codeResourceType = 'sql';
  extensions = ['.sql'];

  public detectLanguage(args: DetectLanguageArgs): boolean {
    const ext = path.extname(args.filePath || '').toLowerCase();
    return this.extensions.includes(ext);
  }

  /**
   * Parses common SQL DDL/function statements into statement-level ranges.
   */
  private parseBlocks(content: string): BlockRange[] {
    const lines = content.split('\n');
    const blocks: BlockRange[] = [];
    const statementPattern =
      /^\s*(create\s+(?:or\s+replace\s+)?(?:table|view|index|schema|function|procedure|trigger)\s+((?:"[^"]+"|`[^`]+`|[A-Za-z_][A-Za-z0-9_]*)(?:\.(?:"[^"]+"|`[^`]+`|[A-Za-z_][A-Za-z0-9_]*))*))/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('--')) {
        continue;
      }
      const match = line.match(statementPattern);
      if (!match) {
        continue;
      }

      const statement = match[1];
      const rawName = match[2] || '';
      const name = rawName.replace(/^["`]|["`]$/g, '');

      let endLine = i + 1;
      for (let j = i; j < lines.length; j++) {
        if (lines[j].includes(';')) {
          endLine = j + 1;
          break;
        }
        endLine = j + 1;
      }

      blocks.push({
        type: 'sql_statement',
        name: name || undefined,
        startLine: i + 1,
        endLine,
        header: statement.trim(),
      });
    }

    return blocks;
  }

  public getDocumentInfo(args: GetDocumentInfoArgs): DocumentInfo {
    const ext = path.extname(args.filePath).toLowerCase();
    const fileName = path.basename(args.filePath);
    return {
      languageId: 'sql',
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

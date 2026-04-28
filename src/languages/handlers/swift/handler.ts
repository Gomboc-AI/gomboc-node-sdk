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

export class SwiftLanguageHandler extends BaseLanguageHandler {
  displayName = 'Swift';
  codeResourceType = 'swift';
  extensions = ['.swift'];

  public detectLanguage(args: DetectLanguageArgs): boolean {
    const ext = path.extname(args.filePath || '').toLowerCase();
    return this.extensions.includes(ext);
  }

  /**
   * Parses major Swift declarations and tracks brace-balanced block boundaries.
   */
  private parseBlocks(content: string): BlockRange[] {
    const lines = content.split('\n');
    const blocks: BlockRange[] = [];
    const declarationPattern =
      /^\s*(?:public|internal|private|fileprivate|open|final|actor|nonisolated|static|class|override|mutating|convenience|required|\s)*\b(class|struct|enum|protocol|extension|func)\s+([A-Za-z_][A-Za-z0-9_]*)/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(declarationPattern);
      if (!match || !line.includes('{')) {
        continue;
      }

      const kind = match[1];
      const name = match[2];
      let depth =
        (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
      let endLine = i + 1;

      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j];
        depth += (next.match(/\{/g) || []).length;
        depth -= (next.match(/\}/g) || []).length;
        endLine = j + 1;
        if (depth <= 0) {
          break;
        }
      }

      blocks.push({
        type: `swift_${kind}`,
        name,
        startLine: i + 1,
        endLine,
        header: line.trim(),
      });
    }

    return blocks;
  }

  public getDocumentInfo(args: GetDocumentInfoArgs): DocumentInfo {
    const ext = path.extname(args.filePath).toLowerCase();
    const fileName = path.basename(args.filePath);
    return {
      languageId: 'swift',
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
    const containing = blocks
      .filter(block => line >= block.startLine && line <= block.endLine)
      .sort((a, b) => a.endLine - b.endLine)[0];
    return containing || null;
  }

  public findNearestBlock(args: FindNearestBlockArgs): BlockRange | null {
    const blocks = this.parseBlocks(args.content);
    if (blocks.length === 0) {
      return null;
    }
    const line = Math.max(1, args.line);
    const containing = blocks
      .filter(block => line >= block.startLine && line <= block.endLine)
      .sort((a, b) => a.endLine - b.endLine)[0];
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

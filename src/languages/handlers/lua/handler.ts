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
export class LuaLanguageHandler extends BaseLanguageHandler {
  displayName = 'Lua';
  codeResourceType = 'lua';
  extensions = ['.lua'];

  public detectLanguage(args: DetectLanguageArgs): boolean {
    const ext = path.extname(args.filePath || '').toLowerCase();
    return this.extensions.includes(ext);
  }

  /**
   * Parses Lua function declarations and computes end-delimited ranges.
   */
  private parseBlocks(content: string): BlockRange[] {
    const lines = content.split('\n');
    const blocks: BlockRange[] = [];
    const functionPatterns = [
      /^\s*function\s+([A-Za-z_][A-Za-z0-9_:.]*)\s*\(/,
      /^\s*local\s+function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/,
      /^\s*([A-Za-z_][A-Za-z0-9_:.]*)\s*=\s*function\s*\(/,
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('--')) {
        continue;
      }

      let functionName: string | undefined;
      for (const pattern of functionPatterns) {
        const match = line.match(pattern);
        if (match) {
          functionName = match[1];
          break;
        }
      }
      if (!functionName) {
        continue;
      }

      let depth = 0;
      let sawOpening = false;
      let endLine = i + 1;
      for (let j = i; j < lines.length; j++) {
        const current = lines[j];
        const openCount =
          (current.match(/\bfunction\b/g) || []).length +
          (current.match(/\bthen\b/g) || []).length +
          (current.match(/\bdo\b/g) || []).length +
          (current.match(/\brepeat\b/g) || []).length;
        const closeCount =
          (current.match(/\bend\b/g) || []).length +
          (current.match(/\buntil\b/g) || []).length;
        if (openCount > 0) {
          sawOpening = true;
        }
        depth += openCount - closeCount;
        if (sawOpening && depth === 0 && j >= i) {
          endLine = j + 1;
          break;
        }
      }

      blocks.push({
        type: 'lua_function',
        name: functionName.split(':').pop(),
        startLine: i + 1,
        endLine,
        header: `function ${functionName}`,
      });
    }

    return blocks;
  }

  public getDocumentInfo(args: GetDocumentInfoArgs): DocumentInfo {
    const ext = path.extname(args.filePath).toLowerCase();
    const fileName = path.basename(args.filePath);
    return {
      languageId: 'lua',
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

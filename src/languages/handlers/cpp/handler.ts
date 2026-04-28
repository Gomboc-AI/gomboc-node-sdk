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

export class CppLanguageHandler extends BaseLanguageHandler {
  displayName = 'C++';
  codeResourceType = 'cpp';
  extensions = ['.cpp', '.cc', '.cxx', '.hpp', '.hh', '.hxx'];

  detectLanguage(args: DetectLanguageArgs): boolean {
    const ext = path.extname(args.filePath || '').toLowerCase();
    return this.extensions.includes(ext);
  }

  /**
   * Parses C++ classes/structs and function definitions into block ranges.
   */
  private parseBlocks(content: string): BlockRange[] {
    const lines = content.split('\n');
    const blocks: BlockRange[] = [];
    const typePattern =
      /^\s*(class|struct)\s+([A-Za-z_][A-Za-z0-9_]*)\b[^{;]*\{/;
    const functionPattern =
      /^\s*(?:template\s*<[^>]+>\s*)?(?:(?:[A-Za-z_][A-Za-z0-9_:\s*&<>,~]*?)\s+)?([A-Za-z_~][A-Za-z0-9_:~]*)\s*\([^;{}]*\)\s*(?:const\s*)?(?:noexcept\s*)?\{/;
    const controlKeywords = new Set([
      'if',
      'for',
      'while',
      'switch',
      'catch',
      'return',
      'new',
      'delete',
    ]);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (
        !trimmed ||
        trimmed.startsWith('//') ||
        trimmed.startsWith('/*') ||
        trimmed === '*'
      ) {
        continue;
      }

      const typeMatch = line.match(typePattern);
      const functionMatch = line.match(functionPattern);
      if (!typeMatch && !functionMatch) {
        continue;
      }

      let type = 'cpp_block';
      let name: string | undefined;
      let header = trimmed;
      if (typeMatch) {
        const kind = typeMatch[1];
        name = typeMatch[2];
        type = `cpp_${kind}`;
        header = `${kind} ${name}`;
      } else if (functionMatch) {
        const rawName = functionMatch[1];
        const functionName = rawName.split('::').pop() || rawName;
        if (controlKeywords.has(functionName)) {
          continue;
        }
        type = 'cpp_function';
        name = functionName;
        header = `function ${functionName}()`;
      }

      let braceDepth = 0;
      let sawOpening = false;
      let endLine = i + 1;
      for (let j = i; j < lines.length; j++) {
        const current = lines[j];
        const openCount = (current.match(/{/g) || []).length;
        const closeCount = (current.match(/}/g) || []).length;
        if (openCount > 0) {
          sawOpening = true;
        }
        braceDepth += openCount - closeCount;
        if (sawOpening && braceDepth === 0 && j >= i) {
          endLine = j + 1;
          break;
        }
      }

      blocks.push({
        type,
        name,
        startLine: i + 1,
        endLine,
        header,
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

  getDocumentInfo(args: GetDocumentInfoArgs): DocumentInfo {
    const ext = path.extname(args.filePath).toLowerCase();
    const fileName = path.basename(args.filePath);
    return {
      languageId: 'cpp',
      filePath: args.filePath,
      fileName,
      extension: ext,
      isConfigLike: false,
      supportsBlocks: true,
    };
  }

  findBlockAtLine(args: FindBlockAtLineArgs): BlockRange | null {
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

  findNearestBlock(args: FindNearestBlockArgs): BlockRange | null {
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

  listBlocks(args: ListBlocksArgs): BlockRange[] {
    return this.parseBlocks(args.content);
  }
}

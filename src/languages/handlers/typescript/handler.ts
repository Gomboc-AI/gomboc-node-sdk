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
export class TypescriptLanguageHandler extends BaseLanguageHandler {
  displayName = 'TypeScript';
  codeResourceType = 'typescript';
  extensions = ['.ts', '.tsx', '.mts', '.cts'];

  public detectLanguage(args: DetectLanguageArgs): boolean {
    const ext = path.extname(args.filePath || '').toLowerCase();
    return this.extensions.includes(ext);
  }

  /**
   * Parses TypeScript declaration/function-style blocks with brace ranges.
   */
  private parseBlocks(content: string): BlockRange[] {
    const lines = content.split('\n');
    const blocks: BlockRange[] = [];
    const typePattern =
      /^\s*(?:export\s+)?(?:default\s+)?(class|interface|enum|namespace)\s+([A-Za-z_$][A-Za-z0-9_$]*)\b[^{;]*\{/;
    const functionPattern =
      /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:<[^>]+>\s*)?\([^;{}]*\)\s*(?::\s*[^{]+)?\{/;
    const methodPattern =
      /^\s*(?:public|protected|private|static|readonly|abstract|async|override|\s)*(?:get|set\s+)?([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:<[^>]+>\s*)?\([^;{}]*\)\s*(?::\s*[^{]+)?\{/;
    const controlKeywords = new Set([
      'if',
      'for',
      'while',
      'switch',
      'catch',
      'try',
      'else',
      'return',
      'new',
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
      const methodMatch = line.match(methodPattern);
      if (!typeMatch && !functionMatch && !methodMatch) {
        continue;
      }

      let type = 'typescript_block';
      let name: string | undefined;
      let header = trimmed;

      if (typeMatch) {
        const kind = typeMatch[1];
        name = typeMatch[2];
        type = `typescript_${kind}`;
        header = `${kind} ${name}`;
      } else if (functionMatch) {
        name = functionMatch[1];
        type = 'typescript_function';
        header = `function ${name}()`;
      } else if (methodMatch) {
        const methodName = methodMatch[1];
        if (
          controlKeywords.has(methodName) ||
          trimmed.startsWith('function ') ||
          trimmed.startsWith('class ') ||
          trimmed.startsWith('interface ')
        ) {
          continue;
        }
        name = methodName;
        type = 'typescript_method';
        header = `method ${name}()`;
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

  public getDocumentInfo(args: GetDocumentInfoArgs): DocumentInfo {
    const ext = path.extname(args.filePath).toLowerCase();
    const fileName = path.basename(args.filePath);
    return {
      languageId: 'typescript',
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

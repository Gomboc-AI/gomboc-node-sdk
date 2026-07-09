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
export class CsharpLanguageHandler extends BaseLanguageHandler {
  displayName = 'C#';
  codeResourceType = 'csharp';
  extensions = ['.cs', '.csx'];

  public detectLanguage(args: DetectLanguageArgs): boolean {
    const ext = path.extname(args.filePath || '').toLowerCase();
    return this.extensions.includes(ext);
  }

  /**
   * Parses C# type/method declarations and computes brace-delimited ranges.
   */
  private parseBlocks(content: string): BlockRange[] {
    const lines = content.split('\n');
    const blocks: BlockRange[] = [];
    const typePattern =
      /^\s*(?:\[[^\]]+\]\s*)*(?:(?:public|protected|private|internal|abstract|sealed|static|partial|readonly|unsafe|new)\s+)*(class|interface|struct|record|enum)\s+([A-Za-z_][A-Za-z0-9_]*)\b[^{;]*\{/;
    const methodPattern =
      /^\s*(?:\[[^\]]+\]\s*)*(?:(?:public|protected|private|internal|static|virtual|override|abstract|sealed|async|extern|unsafe|new|partial)\s+)+(?:(?:[A-Za-z_][A-Za-z0-9_<>[\],.?]*)\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\([^;{}]*\)\s*(?:where\s+[^{]+)?\{/;
    const controlKeywords = new Set([
      'if',
      'for',
      'foreach',
      'while',
      'switch',
      'catch',
      'lock',
      'using',
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
      const methodMatch = line.match(methodPattern);
      if (!typeMatch && !methodMatch) {
        continue;
      }

      let type = 'csharp_block';
      let name: string | undefined;
      let header = trimmed;

      if (typeMatch) {
        const kind = typeMatch[1];
        name = typeMatch[2];
        type = `csharp_${kind}`;
        header = `${kind} ${name}`;
      } else if (methodMatch) {
        const methodName = methodMatch[1];
        if (controlKeywords.has(methodName)) {
          continue;
        }
        type = 'csharp_method';
        name = methodName;
        header = `method ${methodName}()`;
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
      languageId: 'csharp',
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

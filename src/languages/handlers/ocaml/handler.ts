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

export class OcamlLanguageHandler extends BaseLanguageHandler {
  displayName = 'OCaml';
  codeResourceType = 'ocaml';
  extensions = ['.ml', '.mli'];

  public detectLanguage(args: DetectLanguageArgs): boolean {
    const ext = path.extname(args.filePath || '').toLowerCase();
    return this.extensions.includes(ext);
  }

  /**
   * Parses OCaml module and let bindings into approximate block ranges.
   */
  private parseBlocks(content: string): BlockRange[] {
    const lines = content.split('\n');
    const blocks: BlockRange[] = [];

    const modulePattern =
      /^\s*module\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*struct\b/;
    const letPattern =
      /^\s*let\s+(?:rec\s+)?([A-Za-z_][A-Za-z0-9_']*)\b(?:\s+[^=]*)?\s*=/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('(*')) {
        continue;
      }

      const moduleMatch = line.match(modulePattern);
      if (moduleMatch) {
        const moduleName = moduleMatch[1];
        let depth = 0;
        let sawOpening = false;
        let endLine = i + 1;
        for (let j = i; j < lines.length; j++) {
          const current = lines[j];
          const openCount = (current.match(/\bstruct\b/g) || []).length;
          const closeCount = (current.match(/\bend\b/g) || []).length;
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
          type: 'ocaml_module',
          name: moduleName,
          startLine: i + 1,
          endLine,
          header: `module ${moduleName}`,
        });
        continue;
      }

      const letMatch = line.match(letPattern);
      if (!letMatch) {
        continue;
      }

      const letName = letMatch[1];
      let endLine = i + 1;
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].trim();
        if (!next) {
          break;
        }
        if (
          /^\s*let\s+/.test(lines[j]) ||
          /^\s*module\s+/.test(lines[j]) ||
          next === ';;'
        ) {
          break;
        }
        endLine = j + 1;
      }

      blocks.push({
        type: 'ocaml_let',
        name: letName,
        startLine: i + 1,
        endLine,
        header: `let ${letName}`,
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
      languageId: 'ocaml',
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

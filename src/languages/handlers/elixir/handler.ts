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

export class ElixirLanguageHandler extends BaseLanguageHandler {
  displayName = 'Elixir';
  codeResourceType = 'elixir';
  extensions = ['.ex', '.exs'];

  public detectLanguage(args: DetectLanguageArgs): boolean {
    const ext = path.extname(args.filePath || '').toLowerCase();
    return this.extensions.includes(ext);
  }

  /**
   * Parses Elixir function/module declarations into do/end-delimited ranges.
   */
  private parseBlocks(content: string): BlockRange[] {
    const lines = content.split('\n');
    const blocks: BlockRange[] = [];
    const modulePattern =
      /^\s*(defmodule|defprotocol|defimpl)\s+([A-Za-z_][A-Za-z0-9_.]*)\b[^\n]*\bdo\b/;
    const functionPattern =
      /^\s*(def|defp|defmacro|defmacrop|defguard|defguardp)\s+([A-Za-z_][A-Za-z0-9_?!]*)\b[^\n]*\bdo\b/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      const moduleMatch = line.match(modulePattern);
      const functionMatch = line.match(functionPattern);
      if (!moduleMatch && !functionMatch) {
        continue;
      }

      let type = 'elixir_block';
      let name: string | undefined;
      let header = trimmed;

      if (moduleMatch) {
        const kind = moduleMatch[1];
        name = moduleMatch[2];
        type =
          kind === 'defmodule'
            ? 'elixir_module'
            : kind === 'defprotocol'
              ? 'elixir_protocol'
              : 'elixir_impl';
        header = `${kind} ${name}`;
      } else if (functionMatch) {
        const kind = functionMatch[1];
        name = functionMatch[2];
        type = 'elixir_function';
        header = `${kind} ${name}`;
      }

      let depth = 0;
      let sawOpening = false;
      let endLine = i + 1;
      for (let j = i; j < lines.length; j++) {
        const current = lines[j];
        const openCount = (current.match(/\bdo\b/g) || []).length;
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
      languageId: 'elixir',
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

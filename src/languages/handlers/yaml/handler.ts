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
import { YamlBaseLanguageHandler } from '../yamlBase';

export class YamlLanguageHandler extends YamlBaseLanguageHandler {
  displayName = 'YAML';
  codeResourceType = 'yaml';
  extensions = ['.yaml', '.yml'];

  public detectLanguage(args: DetectLanguageArgs): boolean {
    const ext = path.extname(args.filePath || '').toLowerCase();
    return this.extensions.includes(ext);
  }

  /**
   * Parses top-level YAML keys and document separators as navigable blocks.
   */
  private parseBlocks(content: string): BlockRange[] {
    const lines = content.split('\n');
    const blocks: BlockRange[] = [];

    let active: BlockRange | null = null;
    for (let i = 0; i < lines.length; i++) {
      const lineNumber = i + 1;
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed === '---') {
        if (active) {
          active.endLine = lineNumber - 1;
          blocks.push(active);
        }
        active = {
          type: 'yaml_document',
          name: `document-${blocks.length + 1}`,
          startLine: lineNumber,
          endLine: lineNumber,
          header: line,
        };
        continue;
      }

      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      const indent = line.length - line.trimStart().length;
      const topLevelMatch = line.match(/^([A-Za-z0-9_.-]+)\s*:/);
      if (indent !== 0 || !topLevelMatch) {
        continue;
      }

      if (active) {
        active.endLine = lineNumber - 1;
        blocks.push(active);
      }

      active = {
        type: 'yaml_key',
        name: topLevelMatch[1],
        startLine: lineNumber,
        endLine: lineNumber,
        header: line,
      };
    }

    if (active) {
      active.endLine = lines.length;
      blocks.push(active);
    }

    return blocks.filter(block => block.endLine >= block.startLine);
  }

  public getDocumentInfo(args: GetDocumentInfoArgs): DocumentInfo {
    const ext = path.extname(args.filePath).toLowerCase();
    const fileName = path.basename(args.filePath);
    return {
      languageId: 'yaml',
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

import path from 'path';
import {
  BlockRange,
  DetectLanguageArgs,
  DocumentInfo,
  FindBlockAtLineArgs,
  FindNearestBlockArgs,
  GetDocumentInfoArgs,
  ListBlocksArgs,
  ResourceContextExtractKind,
} from '../../types';
import { YamlBaseLanguageHandler } from '../yamlBase';

export class HelmLanguageHandler extends YamlBaseLanguageHandler {
  displayName = 'Helm';
  codeResourceType = 'kubernetes';
  extensions = ['.yaml', '.yml'];

  public detectLanguage(args: DetectLanguageArgs): boolean {
    const filePath = args.filePath || '';
    const ext = path.extname(filePath).toLowerCase();
    if (!this.extensions.includes(ext)) {
      return false;
    }

    const fileName = path.basename(filePath).toLowerCase();
    const dirPath = path.dirname(filePath).toLowerCase();
    if (dirPath.includes('/templates') || dirPath.includes('\\templates\\')) {
      return false;
    }

    if (
      fileName === 'chart.yaml' ||
      fileName === 'chart.yml' ||
      fileName === 'values.yaml' ||
      fileName === 'values.yml' ||
      fileName.startsWith('values-')
    ) {
      return true;
    }

    const content = args.content || '';
    if (content.includes('{{') || content.includes('}}')) {
      return false;
    }

    return (
      (dirPath.includes('/charts/') || dirPath.includes('\\charts\\')) &&
      /(chart|dependency|dependencies|values|maintainers)\s*:/i.test(content)
    );
  }

  public override getResourceContextExtractKind(): ResourceContextExtractKind {
    return 'yaml';
  }

  /**
   * Parses Helm chart/values top-level keys as lightweight block ranges.
   */
  private parseBlocks(content: string): BlockRange[] {
    const lines = content.split('\n');
    const blocks: BlockRange[] = [];
    const keyPattern = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().startsWith('#')) {
        continue;
      }
      const indent = line.match(/^(\s*)/)?.[1]?.length ?? 0;
      if (indent !== 0) {
        continue;
      }
      const match = line.trim().match(keyPattern);
      if (!match) {
        continue;
      }
      const key = match[1];
      blocks.push({
        type: 'helm_key',
        name: key,
        startLine: i + 1,
        endLine: lines.length,
        header: key,
      });
    }

    blocks.sort((a, b) => a.startLine - b.startLine);
    for (let i = 0; i < blocks.length; i++) {
      const next = blocks[i + 1];
      blocks[i].endLine = next
        ? Math.max(blocks[i].startLine, next.startLine - 1)
        : lines.length;
    }

    return blocks;
  }

  public getDocumentInfo(args: GetDocumentInfoArgs): DocumentInfo {
    const ext = path.extname(args.filePath).toLowerCase();
    const fileName = path.basename(args.filePath);
    return {
      languageId: 'helm',
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

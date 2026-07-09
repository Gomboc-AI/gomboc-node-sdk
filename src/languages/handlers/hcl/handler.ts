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
import { BaseLanguageHandler } from '../base';

/** @deprecated Not needed anymore; handled by ORL itself. */
export class HclLanguageHandler extends BaseLanguageHandler {
  displayName = 'HCL';
  codeResourceType = 'hcl';
  extensions = ['.hcl'];

  public detectLanguage(args: DetectLanguageArgs): boolean {
    const ext = path.extname(args.filePath || '').toLowerCase();
    return this.extensions.includes(ext);
  }

  public override getResourceContextExtractKind(): ResourceContextExtractKind {
    return 'terraform';
  }

  /**
   * Parses HCL blocks (resource/module/variable/output/locals/provider) by braces.
   */
  private parseBlocks(content: string): BlockRange[] {
    const lines = content.split('\n');
    const blocks: BlockRange[] = [];
    const resourceLikePattern =
      /^\s*(resource|data|module|variable|output|provider|terraform)\s+"([^"]+)"(?:\s+"([^"]+)")?\s*\{/;
    const localsPattern = /^\s*(locals)\s*\{/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
        continue;
      }

      const resourceMatch = line.match(resourceLikePattern);
      const localsMatch = line.match(localsPattern);
      if (!resourceMatch && !localsMatch) {
        continue;
      }

      let type = 'hcl_block';
      let name: string | undefined;
      let header = trimmed;
      if (resourceMatch) {
        const kind = resourceMatch[1];
        const firstName = resourceMatch[2];
        const secondName = resourceMatch[3];
        type = `hcl_${kind}`;
        name = secondName || firstName;
        header = secondName
          ? `${kind} "${firstName}" "${secondName}"`
          : `${kind} "${firstName}"`;
      } else {
        type = 'hcl_locals';
        name = 'locals';
        header = 'locals';
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

    return blocks;
  }

  public getDocumentInfo(args: GetDocumentInfoArgs): DocumentInfo {
    const ext = path.extname(args.filePath).toLowerCase();
    const fileName = path.basename(args.filePath);
    return {
      languageId: 'hcl',
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

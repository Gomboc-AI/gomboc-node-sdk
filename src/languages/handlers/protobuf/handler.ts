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

export class ProtobufLanguageHandler extends BaseLanguageHandler {
  displayName = 'Protobuf';
  codeResourceType = 'protobuf';
  extensions = ['.proto'];

  public detectLanguage(args: DetectLanguageArgs): boolean {
    const ext = path.extname(args.filePath || '').toLowerCase();
    return this.extensions.includes(ext);
  }

  /**
   * Parses protobuf message/enum/service/rpc declarations into block ranges.
   */
  private parseBlocks(content: string): BlockRange[] {
    const lines = content.split('\n');
    const blocks: BlockRange[] = [];
    const typePattern =
      /^\s*(message|enum|service)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/;
    const rpcPattern =
      /^\s*rpc\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s+returns\s*\([^)]*\)\s*(\{|;)/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//')) {
        continue;
      }

      const typeMatch = line.match(typePattern);
      if (typeMatch) {
        const kind = typeMatch[1];
        const name = typeMatch[2];
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
          type: `protobuf_${kind}`,
          name,
          startLine: i + 1,
          endLine,
          header: `${kind} ${name}`,
        });
        continue;
      }

      const rpcMatch = line.match(rpcPattern);
      if (!rpcMatch) {
        continue;
      }

      const rpcName = rpcMatch[1];
      const hasBody = rpcMatch[2] === '{';
      let endLine = i + 1;
      if (hasBody) {
        let braceDepth = 0;
        let sawOpening = false;
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
      }

      blocks.push({
        type: 'protobuf_rpc',
        name: rpcName,
        startLine: i + 1,
        endLine,
        header: `rpc ${rpcName}`,
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
      languageId: 'protobuf',
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

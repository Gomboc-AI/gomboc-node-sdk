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

export class RubyLanguageHandler extends BaseLanguageHandler {
  displayName = 'Ruby';
  codeResourceType = 'ruby';
  extensions = ['.rb', '.rake', '.gemspec'];

  public detectLanguage(args: DetectLanguageArgs): boolean {
    const filePath = args.filePath || '';
    const ext = path.extname(filePath).toLowerCase();
    if (this.extensions.includes(ext)) {
      return true;
    }
    const fileName = path.basename(filePath).toLowerCase();
    if (fileName === 'gemfile' || fileName === 'rakefile') {
      return true;
    }
    return /^#!\s*(?:\/usr\/bin\/env\s+ruby\b|\/usr\/bin\/ruby\b)/.test(
      ((args.content || '').split('\n')[0] || '').trim()
    );
  }

  /**
   * Parses Ruby class/module/def blocks and computes end-delimited ranges.
   */
  private parseBlocks(content: string): BlockRange[] {
    const lines = content.split('\n');
    const blocks: BlockRange[] = [];
    const classPattern = /^\s*class\s+([A-Za-z_][A-Za-z0-9_:]*)\b/;
    const modulePattern = /^\s*module\s+([A-Za-z_][A-Za-z0-9_:]*)\b/;
    const defPattern =
      /^\s*def\s+(self\.[A-Za-z_][A-Za-z0-9_!?=]*|[A-Za-z_][A-Za-z0-9_!?=]*)\b/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      let type = '';
      let name = '';
      let header = '';

      const classMatch = line.match(classPattern);
      const moduleMatch = line.match(modulePattern);
      const defMatch = line.match(defPattern);
      if (classMatch) {
        type = 'ruby_class';
        name = classMatch[1];
        header = `class ${name}`;
      } else if (moduleMatch) {
        type = 'ruby_module';
        name = moduleMatch[1];
        header = `module ${name}`;
      } else if (defMatch) {
        type = 'ruby_method';
        name = defMatch[1].replace(/^self\./, '');
        header = `def ${name}`;
      } else {
        continue;
      }

      let depth = 0;
      let sawOpening = false;
      let endLine = i + 1;
      for (let j = i; j < lines.length; j++) {
        const current = lines[j];
        const openCount = (
          current.match(
            /\b(class|module|def|if|unless|case|begin|do|while|until|for)\b/g
          ) || []
        ).length;
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
      languageId: 'ruby',
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

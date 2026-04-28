import path from 'path';
import Parser from 'tree-sitter';
import Python from 'tree-sitter-python';
import {
  TreeSitterLanguageHandler,
  compileQuery,
  parseContent,
  runQuery,
  syntaxNodeToBlockRange,
} from '../../index';
import {
  BlockRange,
  DetectLanguageArgs,
  DocumentInfo,
  GetDocumentInfoArgs,
  ListBlocksArgs,
  ResolveDiagnosticAnchorLineArgs,
} from '../../../types';

const PYTHON_BLOCK_QUERY = `
(decorated_definition
  definition: (function_definition name: (identifier) @block.name)) @block
(decorated_definition
  definition: (class_definition name: (identifier) @block.name)) @block
(function_definition name: (identifier) @block.name) @block
(class_definition name: (identifier) @block.name) @block
`;

export class TreeSitterPythonLanguageHandler extends TreeSitterLanguageHandler {
  displayName = 'Python';
  codeResourceType = 'python';

  public detectLanguage(args: DetectLanguageArgs): boolean {
    const ext = path.extname(args.filePath || '').toLowerCase();
    return ext === '.py';
  }

  public getDocumentInfo(args: GetDocumentInfoArgs): DocumentInfo {
    const extension = path.extname(args.filePath).toLowerCase();
    const fileName = path.basename(args.filePath);

    return {
      languageId: 'python',
      filePath: args.filePath,
      fileName,
      extension,
      supportsBlocks: true,
      isConfigLike: false,
    };
  }

  public getTreeSitterLanguage(): Parser.Language {
    // tree-sitter-python's published Node type omits `name`, while tree-sitter@0.25.0's
    // Parser.Language typing requires it. This cast keeps runtime behavior unchanged and
    // avoids a false-positive TS structural mismatch until upstream typings converge.
    return Python as unknown as Parser.Language;
  }

  public getBlockQuery(): string {
    return PYTHON_BLOCK_QUERY;
  }

  /**
   * Uses tree-sitter query captures to enumerate Python blocks while removing
   * inner captures inside decorated definitions (the decorator wrapper is anchor).
   */
  public listBlocks(args: ListBlocksArgs): BlockRange[] {
    const language = this.getTreeSitterLanguage();
    const tree = parseContent(language, args.content);
    const query = compileQuery(language, this.getBlockQuery());
    const matches = runQuery(tree, query);
    const blocks: BlockRange[] = [];

    for (const match of matches) {
      if (match.captures.length === 0) {
        continue;
      }

      const blockCapture =
        match.captures.find(capture => capture.name === 'block') ||
        match.captures[0];
      const blockNode = blockCapture.node;

      if (blockNode.parent?.type === 'decorated_definition') {
        continue;
      }

      const nameCapture = match.captures.find(
        capture => capture.name === 'block.name'
      );
      const block = syntaxNodeToBlockRange(blockNode, nameCapture?.node);
      block.type = this.getCompatibilityBlockType(blockNode);
      blocks.push(block);
    }

    blocks.sort((left, right) => {
      if (left.startLine !== right.startLine) {
        return left.startLine - right.startLine;
      }
      return left.endLine - right.endLine;
    });

    return blocks;
  }

  /**
   * Anchors diagnostics to the nearest enclosing block header when possible.
   */
  public resolveDiagnosticAnchorLine(args: ResolveDiagnosticAnchorLineArgs): number {
    const suggestedLine =
      Number.isFinite(args.suggestedLine) && args.suggestedLine > 0
        ? Math.floor(args.suggestedLine)
        : 1;
    const block = this.findBlockAtLine({
      filePath: '',
      content: args.content,
      line: suggestedLine,
    });

    if (block) {
      return block.startLine;
    }

    return super.resolveDiagnosticAnchorLine(args);
  }

  /**
   * Maps Python grammar node types into legacy-compatible diagnostic block types.
   */
  private getCompatibilityBlockType(node: Parser.SyntaxNode): string {
    if (node.type === 'function_definition' || node.type === 'async_function_definition') {
      return 'python_function';
    }

    if (node.type === 'class_definition') {
      return 'python_class';
    }

    if (node.type === 'decorated_definition') {
      const innerDefinition = node.childForFieldName('definition');
      if (!innerDefinition) {
        return 'python_function';
      }

      if (
        innerDefinition.type === 'function_definition' ||
        innerDefinition.type === 'async_function_definition'
      ) {
        return 'python_function';
      }

      if (innerDefinition.type === 'class_definition') {
        return 'python_class';
      }
    }

    return node.type;
  }
}

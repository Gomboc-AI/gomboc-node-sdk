import path from 'path';
import Parser from 'tree-sitter';
import Java from 'tree-sitter-java';
import {
  TreeSitterLanguageHandler,
  compileQuery,
  findSmallestEnclosingNode,
  parseContent,
  runQuery,
} from '../../index';
import {
  BlockRange,
  DetectLanguageArgs,
  DocumentInfo,
  FindBlockAtLineArgs,
  GetDocumentInfoArgs,
  ListBlocksArgs,
  ResolveDiagnosticAnchorLineArgs,
} from '../../../types';

const JAVA_BLOCK_NODE_TYPES = new Set([
  'class_declaration',
  'interface_declaration',
  'enum_declaration',
  'record_declaration',
  'method_declaration',
  'constructor_declaration',
]);

export class TreeSitterJavaLanguageHandler extends TreeSitterLanguageHandler {
  displayName = 'Java';
  codeResourceType = 'java';

  detectLanguage(args: DetectLanguageArgs): boolean {
    const ext = path.extname(args.filePath || '').toLowerCase();
    return ext === '.java';
  }

  getDocumentInfo(args: GetDocumentInfoArgs): DocumentInfo {
    const extension = path.extname(args.filePath).toLowerCase();
    const fileName = path.basename(args.filePath);

    return {
      languageId: 'java',
      filePath: args.filePath,
      fileName,
      extension,
      isConfigLike: false,
      supportsBlocks: true,
    };
  }

  getTreeSitterLanguage(): Parser.Language {
    return Java as unknown as Parser.Language;
  }

  getBlockQuery(): string {
    return `
(class_declaration name: (identifier) @block.name) @block
(interface_declaration name: (identifier) @block.name) @block
(enum_declaration name: (identifier) @block.name) @block
(record_declaration name: (identifier) @block.name) @block
(method_declaration name: (identifier) @block.name) @block
(constructor_declaration name: (identifier) @block.name) @block
    `.trim();
  }

  override listBlocks(args: ListBlocksArgs): BlockRange[] {
    const language = this.getTreeSitterLanguage();
    const tree = parseContent(language, args.content);
    const query = compileQuery(language, this.getBlockQuery());
    const matches = runQuery(tree, query);
    const blocks: BlockRange[] = [];

    for (const match of matches) {
      const blockCapture = match.captures.find(capture => capture.name === 'block');
      if (!blockCapture) {
        continue;
      }

      const nameCapture = match.captures.find(
        capture => capture.name === 'block.name'
      );
      const block = this.toBlockRange(blockCapture.node, nameCapture?.node.text);
      if (block) {
        blocks.push(block);
      }
    }

    blocks.sort((left, right) => {
      if (left.startLine !== right.startLine) {
        return left.startLine - right.startLine;
      }
      return left.endLine - right.endLine;
    });

    return blocks;
  }

  override findBlockAtLine(args: FindBlockAtLineArgs): BlockRange | null {
    const language = this.getTreeSitterLanguage();
    const tree = parseContent(language, args.content);
    const row = Math.max(0, Math.floor(args.line) - 1);
    const smallest = findSmallestEnclosingNode(tree.rootNode, row);
    if (!smallest) {
      return null;
    }

    let current: Parser.SyntaxNode | null = smallest;
    while (current) {
      if (JAVA_BLOCK_NODE_TYPES.has(current.type)) {
        const nameNode = current.childForFieldName('name');
        return this.toBlockRange(current, nameNode?.text);
      }
      current = current.parent;
    }

    return null;
  }

  override resolveDiagnosticAnchorLine(args: ResolveDiagnosticAnchorLineArgs): number {
    const maxLine = Math.max(1, args.content.split('\n').length);
    if (args.suggestedLine > maxLine) {
      return maxLine;
    }
    return super.resolveDiagnosticAnchorLine(args);
  }

  private toBlockRange(
    node: Parser.SyntaxNode,
    capturedName?: string
  ): BlockRange | null {
    const name = capturedName || node.childForFieldName('name')?.text;
    if (!name) {
      return null;
    }

    if (node.type === 'class_declaration') {
      return this.makeBlock(node, name, 'java_class', `class ${name}`);
    }
    if (node.type === 'interface_declaration') {
      return this.makeBlock(node, name, 'java_interface', `interface ${name}`);
    }
    if (node.type === 'enum_declaration') {
      return this.makeBlock(node, name, 'java_enum', `enum ${name}`);
    }
    if (node.type === 'record_declaration') {
      return this.makeBlock(node, name, 'java_record', `record ${name}`);
    }
    if (
      node.type === 'method_declaration' ||
      node.type === 'constructor_declaration'
    ) {
      return this.makeBlock(node, name, 'java_method', `method ${name}()`);
    }

    return null;
  }

  private makeBlock(
    node: Parser.SyntaxNode,
    name: string,
    type: string,
    header: string
  ): BlockRange {
    return {
      type,
      name,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      header,
    };
  }
}

import path from 'path';
import Parser from 'tree-sitter';
import JSON_ from 'tree-sitter-json';
import { TreeSitterLanguageHandler, parseContent } from '../../index';
import {
  BlockRange,
  BuildDiagnosticContextArgs,
  DetectLanguageArgs,
  DiagnosticContext,
  DocumentInfo,
  FormatBlockDisplayNameArgs,
  GetDocumentInfoArgs,
  ListBlocksArgs,
  ResolveDiagnosticAnchorLineArgs,
  ResourceContextExtractKind,
} from '../../../types';

export class TreeSitterCloudFormationJsonLanguageHandler extends TreeSitterLanguageHandler {
  displayName = 'CloudFormation JSON';
  codeResourceType = 'cloudformation';

  detectLanguage(args: DetectLanguageArgs): boolean {
    const filePath = args.filePath || '';
    const fileName = path.basename(filePath).toLowerCase();
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== '.json') {
      return false;
    }

    if (fileName === 'package.json' || fileName === 'package-lock.json') {
      return false;
    }

    // Avoid treating arbitrary JSON (e.g. tsconfig) as CloudFormation; align with ORL staging.
    const baseName = path.basename(filePath, ext).toLowerCase();
    return (
      baseName.includes('template') ||
      baseName.includes('cloudformation') ||
      baseName.includes('cfn') ||
      baseName.includes('stack')
    );
  }

  getDocumentInfo(args: GetDocumentInfoArgs): DocumentInfo {
    const extension = path.extname(args.filePath).toLowerCase();
    const fileName = path.basename(args.filePath);

    return {
      languageId: 'cloudformation-json',
      filePath: args.filePath,
      fileName,
      extension,
      isConfigLike: true,
      supportsBlocks: true,
    };
  }

  getTreeSitterLanguage(): Parser.Language {
    return JSON_ as unknown as Parser.Language;
  }

  getBlockQuery(): string {
    return '';
  }

  override getResourceContextExtractKind(): ResourceContextExtractKind {
    return 'json';
  }

  override listBlocks(args: ListBlocksArgs): BlockRange[] {
    try {
      const tree = parseContent(this.getTreeSitterLanguage(), args.content);
      const rootObject = this.findRootObject(tree.rootNode);
      if (!rootObject) {
        return [];
      }

      const resourcesPair = this.getObjectPairs(rootObject).find(
        pair => this.getPairKeyText(pair, args.content) === 'Resources'
      );
      if (!resourcesPair) {
        return [];
      }

      const resourcesValue =
        resourcesPair.childForFieldName('value') ||
        resourcesPair.namedChildren[1];
      if (!resourcesValue || resourcesValue.type !== 'object') {
        return [];
      }

      const blocks: BlockRange[] = [];
      for (const resourcePair of this.getObjectPairs(resourcesValue)) {
        const logicalId = this.getPairKeyText(resourcePair, args.content);
        if (!logicalId) {
          continue;
        }

        const cfnType = this.findResourceType(resourcePair, args.content);
        const hasType = Boolean(cfnType);

        blocks.push({
          type: cfnType || 'cloudformation_resource',
          name: logicalId,
          startLine: resourcePair.startPosition.row + 1,
          endLine: resourcePair.endPosition.row + 1,
          header: hasType ? `${logicalId} (${cfnType})` : logicalId,
        });
      }

      blocks.sort((left, right) => {
        if (left.startLine !== right.startLine) {
          return left.startLine - right.startLine;
        }
        return left.endLine - right.endLine;
      });

      return blocks;
    } catch {
      return [];
    }
  }

  override buildDiagnosticContext(
    args: BuildDiagnosticContextArgs
  ): DiagnosticContext {
    const ctx = super.buildDiagnosticContext(args);
    if (
      !ctx.block &&
      (!ctx.blockHeader || ctx.blockHeader === path.basename(args.filePath))
    ) {
      ctx.blockHeader = `CloudFormation ${path.basename(args.filePath)}`;
    }
    return ctx;
  }

  /**
   * Keeps insertion anchors stable by using the last non-root named node in JSON files.
   */
  override resolveDiagnosticAnchorLine(
    args: ResolveDiagnosticAnchorLineArgs
  ): number {
    const language = this.getTreeSitterLanguage();
    const tree = parseContent(language, args.content);
    const maxLine = tree.rootNode.endPosition.row + 1;
    const suggestedLine =
      Number.isFinite(args.suggestedLine) && args.suggestedLine > 0
        ? Math.floor(args.suggestedLine)
        : 1;

    if (suggestedLine <= maxLine) {
      return super.resolveDiagnosticAnchorLine(args);
    }

    const lastNamedNode = this.findLastNamedNode(tree.rootNode);
    if (!lastNamedNode) {
      return 1;
    }

    const resolvedLine = lastNamedNode.startPosition.row + 1;
    return Math.min(maxLine, Math.max(1, resolvedLine));
  }

  override formatBlockDisplayName(args: FormatBlockDisplayNameArgs): string {
    return `CloudFormation: ${path.basename(args.filePath)}`;
  }

  private findRootObject(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
    if (node.type === 'object') {
      return node;
    }

    for (const child of node.namedChildren) {
      if (child.type === 'object') {
        return child;
      }
    }

    return null;
  }

  private getObjectPairs(node: Parser.SyntaxNode): Parser.SyntaxNode[] {
    if (node.type !== 'object') {
      return [];
    }
    return node.namedChildren.filter(child => child.type === 'pair');
  }

  private findResourceType(
    resourcePair: Parser.SyntaxNode,
    content: string
  ): string | null {
    const valueNode =
      resourcePair.childForFieldName('value') || resourcePair.namedChildren[1];
    if (!valueNode || valueNode.type !== 'object') {
      return null;
    }

    for (const child of this.getObjectPairs(valueNode)) {
      if (this.getPairKeyText(child, content) !== 'Type') {
        continue;
      }

      const typeValueNode =
        child.childForFieldName('value') || child.namedChildren[1];
      if (!typeValueNode || typeValueNode.type !== 'string') {
        return null;
      }

      const rawType = this.nodeText(typeValueNode, content).trim();
      if (!rawType) {
        return null;
      }

      return this.stripOuterQuotes(rawType);
    }

    return null;
  }

  private getPairKeyText(pair: Parser.SyntaxNode, content: string): string {
    const keyNode = pair.childForFieldName('key') || pair.namedChildren[0];
    if (!keyNode || keyNode.type !== 'string') {
      return '';
    }

    const keyText = this.nodeText(keyNode, content).trim();
    return this.stripOuterQuotes(keyText);
  }

  private stripOuterQuotes(value: string): string {
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      return value.slice(1, -1);
    }
    return value;
  }

  private nodeText(node: Parser.SyntaxNode, content: string): string {
    return content.slice(node.startIndex, node.endIndex);
  }

  private findLastNamedNode(root: Parser.SyntaxNode): Parser.SyntaxNode | null {
    let best: Parser.SyntaxNode | null = null;

    const visit = (node: Parser.SyntaxNode): void => {
      if (!node.isNamed) {
        return;
      }

      if (node.type !== 'document') {
        if (
          !best ||
          node.startPosition.row > best.startPosition.row ||
          (node.startPosition.row === best.startPosition.row &&
            node.endPosition.row >= best.endPosition.row)
        ) {
          best = node;
        }
      }

      for (const child of node.namedChildren) {
        visit(child);
      }
    };

    visit(root);
    return best;
  }
}

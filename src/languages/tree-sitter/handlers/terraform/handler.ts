import path from 'path';
import Parser from 'tree-sitter';
import HCL from '@tree-sitter-grammars/tree-sitter-hcl';
import {
  TreeSitterLanguageHandler,
  compileQuery,
  findLastNodeBefore,
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
  MatchRulesToDiffArgs,
  ResolveDiagnosticAnchorLineArgs,
  ResourceContextExtractKind,
} from '../../../types';

const TERRAFORM_BLOCK_QUERY = `
(config_file
  (body
    (block
      (identifier) @block.keyword
      (string_lit (template_literal) @block.label1)?
      (string_lit (template_literal) @block.label2)?) @block))
`;

export class TreeSitterTerraformLanguageHandler extends TreeSitterLanguageHandler {
  displayName = 'Terraform';
  diagnosticClearScope = 'directory' as const;
  codeResourceType = 'terraform';

  public detectLanguage(args: DetectLanguageArgs): boolean {
    const ext = path.extname(args.filePath || '').toLowerCase();
    return ext === '.tf' || ext === '.tfvars' || ext === '.hcl';
  }

  public getDocumentInfo(args: GetDocumentInfoArgs): DocumentInfo {
    const extension = path.extname(args.filePath).toLowerCase();
    const fileName = path.basename(args.filePath);

    return {
      languageId: 'terraform',
      filePath: args.filePath,
      fileName,
      extension,
      isConfigLike: true,
      supportsBlocks: true,
    };
  }

  public getTreeSitterLanguage(): Parser.Language {
    return HCL as unknown as Parser.Language;
  }

  public getBlockQuery(): string {
    return TERRAFORM_BLOCK_QUERY;
  }

  public override getResourceContextExtractKind(): ResourceContextExtractKind {
    return 'terraform';
  }

  public override listBlocks(args: ListBlocksArgs): BlockRange[] {
    const language = this.getTreeSitterLanguage();
    const tree = parseContent(language, args.content);
    const query = compileQuery(language, this.getBlockQuery());
    const matches = runQuery(tree, query);
    const captureMap = new Map<
      string,
      {
        blockNode: Parser.SyntaxNode;
        keyword?: string;
        labels: Array<{ startIndex: number; value: string }>;
      }
    >();

    for (const match of matches) {
      if (match.captures.length === 0) {
        continue;
      }

      const blockCapture = match.captures.find(
        capture => capture.name === 'block'
      );
      const keywordCapture = match.captures.find(
        capture => capture.name === 'block.keyword'
      );
      if (!blockCapture || !keywordCapture) {
        continue;
      }
      const key = `${blockCapture.node.startIndex}:${blockCapture.node.endIndex}`;
      const existing = captureMap.get(key) || {
        blockNode: blockCapture.node,
        labels: [],
      };

      const label1Capture = match.captures.find(
        capture => capture.name === 'block.label1'
      );
      const label2Capture = match.captures.find(
        capture => capture.name === 'block.label2'
      );
      existing.keyword = this.nodeText(keywordCapture.node, args.content);
      if (label1Capture) {
        existing.labels.push({
          startIndex: label1Capture.node.startIndex,
          value: this.nodeText(label1Capture.node, args.content),
        });
      }
      if (label2Capture) {
        existing.labels.push({
          startIndex: label2Capture.node.startIndex,
          value: this.nodeText(label2Capture.node, args.content),
        });
      }

      captureMap.set(key, existing);
    }

    const blocks: BlockRange[] = [];
    for (const { blockNode, keyword, labels } of captureMap.values()) {
      if (!keyword) {
        continue;
      }
      const sortedLabels = [...labels]
        .sort((left, right) => left.startIndex - right.startIndex)
        .filter(
          (entry, index, all) =>
            index === 0 || entry.startIndex !== all[index - 1].startIndex
        );
      const label1 = sortedLabels[0]?.value;
      const label2 = sortedLabels[1]?.value;

      const block = syntaxNodeToBlockRange(blockNode);
      switch (keyword) {
        case 'resource':
          block.type = label1 || 'resource';
          block.name = label2;
          block.header = `resource "${label1 || ''}" "${label2 || ''}"`;
          break;
        case 'data':
          block.type = label1 || 'data';
          block.name = label2;
          block.header = `data "${label1 || ''}" "${label2 || ''}"`;
          break;
        case 'module':
          block.type = 'module';
          block.name = label1;
          block.header = `module "${label1 || ''}"`;
          break;
        case 'variable':
          block.type = 'variable';
          block.name = label1;
          block.header = `variable "${label1 || ''}"`;
          break;
        case 'output':
          block.type = 'output';
          block.name = label1;
          block.header = `output "${label1 || ''}"`;
          break;
        case 'provider':
          block.type = 'provider';
          block.name = label1;
          block.header = `provider "${label1 || ''}"`;
          break;
        case 'locals':
          block.type = 'locals';
          block.name = undefined;
          block.header = 'locals';
          break;
        case 'terraform':
          block.type = 'terraform';
          block.name = undefined;
          block.header = 'terraform';
          break;
        default:
          block.type = keyword;
          block.name = label1;
          block.header = keyword;
      }

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
   * Anchors diagnostics to the edit line, except insertion-style fixes which
   * anchor to the nearest node above the insertion point.
   */
  public override resolveDiagnosticAnchorLine(
    args: ResolveDiagnosticAnchorLineArgs
  ): number {
    const suggestedLine =
      Number.isFinite(args.suggestedLine) && args.suggestedLine > 0
        ? Math.floor(args.suggestedLine)
        : 1;
    const language = this.getTreeSitterLanguage();
    const tree = parseContent(language, args.content);
    const maxLine = tree.rootNode.endPosition.row + 1;

    if (!args.fromFixOperation) {
      return Math.min(maxLine, Math.max(1, suggestedLine));
    }

    const insertionRow = suggestedLine - 1;
    const searchRow = Math.max(0, insertionRow - 1);
    const previousNode = findLastNodeBefore(tree.rootNode, searchRow);
    if (previousNode) {
      const resolved = previousNode.startPosition.row + 1;
      return Math.min(maxLine, Math.max(1, resolved));
    }

    return 1;
  }

  /**
   * Terraform-specific rule matching: filters by block-type variants so that
   * rules are attributed only to relevant resource types.
   */
  override matchRulesToDiff(args: MatchRulesToDiffArgs): string[] {
    if (args.blockType === 'Resource' || !args.blockType) {
      return [...args.allFileRules];
    }

    const normalized = args.blockType
      .replace(/^hashicorp__/, '')
      .replace(/^aws-resources-/, '')
      .replace(/^google-resources-/, '')
      .replace(/^azurerm-resources-/, '')
      .replace(/\./g, '_')
      .replace(/-/g, '_');

    const core = normalized.replace(/^(aws_|google_|azurerm_)/, '');
    const coreWithDashes = core.replace(/_/g, '-');
    const normalizedWithDashes = normalized.replace(/_/g, '-');

    const variants = [
      normalized,
      normalizedWithDashes,
      `hashicorp__aws-resources-${normalized}`,
      `hashicorp__aws-resources-aws_${normalized}`,
      `hashicorp__google-resources-${normalized}`,
      `hashicorp__google-resources-google_${normalized}`,
      `aws-resources-${normalized}`,
      `aws-resources-aws_${normalized}`,
      `hashicorp__aws-resources-${normalizedWithDashes}`,
      `aws-resources-${normalizedWithDashes}`,
    ];

    if (core.includes('_') || core.includes('-')) {
      variants.splice(1, 0, core, coreWithDashes);
    }

    const matched: string[] = [];
    for (const ruleName of args.allFileRules) {
      const ruleLower = ruleName.toLowerCase();
      if (variants.some(v => ruleLower.includes(v.toLowerCase()))) {
        matched.push(ruleName);
      }
    }

    return matched.length > 0 ? matched : [...args.allFileRules];
  }

  private nodeText(node: Parser.SyntaxNode, content: string): string {
    return content.slice(node.startIndex, node.endIndex);
  }
}

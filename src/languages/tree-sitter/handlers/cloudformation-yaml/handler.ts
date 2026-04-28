import path from 'path';
import Parser from 'tree-sitter';
import YAML from '@tree-sitter-grammars/tree-sitter-yaml';
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
  MatchRulesToDiffArgs,
  ResourceContextExtractKind,
} from '../../../types';

export class TreeSitterCloudFormationYamlLanguageHandler extends TreeSitterLanguageHandler {
  displayName = 'CloudFormation YAML';
  codeResourceType = 'cloudformation';

  private hasPatternAtLineStart(content: string, pattern: string): boolean {
    const lines = content.split('\n');
    for (const line of lines) {
      if (line.trim().startsWith(pattern)) {
        return true;
      }
    }
    return false;
  }

  detectLanguage(args: DetectLanguageArgs): boolean {
    const filePath = args.filePath || '';
    const content = args.content || '';
    const fileName = path.basename(filePath).toLowerCase();
    const dirPath = path.dirname(filePath).toLowerCase();
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== '.yaml' && ext !== '.yml') {
      return false;
    }

    const firstLines = content.split('\n').slice(0, 50).join('\n');
    const contentLower = firstLines.toLowerCase();
    const isHelmDir =
      dirPath.includes('/charts/') ||
      dirPath.includes('/helm/') ||
      dirPath.includes('\\charts\\') ||
      dirPath.includes('\\helm\\');
    const isK8sDir =
      dirPath.includes('/k8s/') ||
      dirPath.includes('/kubernetes/') ||
      dirPath.includes('/manifests/') ||
      dirPath.includes('\\k8s\\') ||
      dirPath.includes('\\kubernetes\\') ||
      dirPath.includes('\\manifests\\');

    const isHelm =
      this.hasPatternAtLineStart(firstLines, '{{') ||
      contentLower.includes('.values') ||
      contentLower.includes('.chart') ||
      contentLower.includes('.release') ||
      fileName.includes('helm') ||
      fileName.includes('chart') ||
      isHelmDir;
    const isKubernetes =
      (this.hasPatternAtLineStart(firstLines, 'kind:') &&
        this.hasPatternAtLineStart(firstLines, 'apiVersion:')) ||
      isK8sDir;

    return !isHelm && !isKubernetes;
  }

  public getDocumentInfo(args: GetDocumentInfoArgs): DocumentInfo {
    const extension = path.extname(args.filePath).toLowerCase();
    const fileName = path.basename(args.filePath);

    return {
      languageId: 'cloudformation-yaml',
      filePath: args.filePath,
      fileName,
      extension,
      isConfigLike: true,
      supportsBlocks: true,
    };
  }

  public getTreeSitterLanguage(): Parser.Language {
    return YAML as unknown as Parser.Language;
  }

  public getBlockQuery(): string {
    return '';
  }

  public override getResourceContextExtractKind(): ResourceContextExtractKind {
    return 'yaml';
  }

  public override listBlocks(args: ListBlocksArgs): BlockRange[] {
    const language = this.getTreeSitterLanguage();
    const tree = parseContent(language, args.content);
    const rootMapping = this.findFirstNodeByType(tree.rootNode, 'block_mapping');
    if (!rootMapping) {
      return [];
    }

    const resourcesPair = rootMapping.namedChildren.find(child => {
      if (child.type !== 'block_mapping_pair') {
        return false;
      }
      return this.getPairKeyText(child, args.content) === 'Resources';
    });
    if (!resourcesPair) {
      return [];
    }

    const resourcesValueNode =
      resourcesPair.childForFieldName('value') || resourcesPair.namedChildren[1];
    if (!resourcesValueNode) {
      return [];
    }

    const resourcesMapping =
      resourcesValueNode.type === 'block_mapping'
        ? resourcesValueNode
        : this.findFirstNodeByType(resourcesValueNode, 'block_mapping');
    if (!resourcesMapping) {
      return [];
    }

    const blocks: BlockRange[] = [];
    for (const resourcePair of resourcesMapping.namedChildren) {
      if (resourcePair.type !== 'block_mapping_pair') {
        continue;
      }

      const logicalId = this.getPairKeyText(resourcePair, args.content);
      if (!logicalId) {
        continue;
      }

      const cfnType = this.findResourceType(resourcePair, args.content);
      blocks.push({
        type: cfnType || 'cloudformation_resource',
        name: logicalId,
        startLine: resourcePair.startPosition.row + 1,
        endLine: resourcePair.endPosition.row + 1,
        header: cfnType ? `${logicalId} (${cfnType})` : logicalId,
      });
    }

    blocks.sort((left, right) => {
      if (left.startLine !== right.startLine) {
        return left.startLine - right.startLine;
      }
      return left.endLine - right.endLine;
    });

    return blocks;
  }

  private findResourceType(
    resourcePair: Parser.SyntaxNode,
    content: string
  ): string | null {
    const valueNode =
      resourcePair.childForFieldName('value') || resourcePair.namedChildren[1];
    if (!valueNode) {
      return null;
    }

    const resourceMapping =
      valueNode.type === 'block_mapping'
        ? valueNode
        : this.findFirstNodeByType(valueNode, 'block_mapping');
    if (!resourceMapping) {
      return null;
    }

    for (const child of resourceMapping.namedChildren) {
      if (child.type !== 'block_mapping_pair') {
        continue;
      }

      if (this.getPairKeyText(child, content) !== 'Type') {
        continue;
      }

      const typeValueNode = child.childForFieldName('value') || child.namedChildren[1];
      if (!typeValueNode) {
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
    if (!keyNode) {
      return '';
    }
    return this.stripOuterQuotes(this.nodeText(keyNode, content).trim());
  }

  private stripOuterQuotes(value: string): string {
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith('\'') && value.endsWith('\''))
    ) {
      return value.slice(1, -1);
    }
    return value;
  }

  private findFirstNodeByType(
    node: Parser.SyntaxNode,
    type: string
  ): Parser.SyntaxNode | null {
    if (node.type === type) {
      return node;
    }
    for (const child of node.namedChildren) {
      const found = this.findFirstNodeByType(child, type);
      if (found) {
        return found;
      }
    }
    return null;
  }

  private nodeText(node: Parser.SyntaxNode, content: string): string {
    return content.slice(node.startIndex, node.endIndex);
  }

  /**
   * Normalizes a CloudFormation `Type` string (e.g. AWS::S3::Bucket) into
   * lowercase segments. Returns null when the type is missing or not usable for matching.
   */
  private parseCloudFormationTypeSegments(blockType: string): string[] | null {
    const cleaned = (blockType || '').trim().toLowerCase();
    if (
      !cleaned ||
      cleaned === 'resource' ||
      cleaned === 'cloudformation_resource'
    ) {
      return null;
    }
    const segments = cleaned.split(/[:._-]+/).filter(Boolean);
    return segments.length > 0 ? segments : null;
  }

  private buildBlockTypeMatchTokens(blockType: string): string[] {
    const segments = this.parseCloudFormationTypeSegments(blockType);
    if (!segments) {
      return [];
    }

    const cleaned = (blockType || '').trim().toLowerCase();
    const joinedUnderscore = segments.join('_');
    const joinedDash = segments.join('-');
    const provider = segments[0];
    const coreSegments = segments.length > 1 ? segments.slice(1) : segments;
    const coreUnderscore = coreSegments.join('_');
    const coreDash = coreSegments.join('-');

    const variants = new Set<string>([
      cleaned,
      joinedUnderscore,
      joinedDash,
      `cloudformation-${joinedDash}`,
      `cloudformation_${joinedUnderscore}`,
    ]);

    if (coreUnderscore) {
      variants.add(coreUnderscore);
      variants.add(coreDash);
    }

    if (provider) {
      variants.add(`${provider}_${coreUnderscore}`);
      variants.add(`${provider}-${coreDash}`);
      variants.add(`aws-resources-${provider}_${coreUnderscore}`);
      variants.add(`aws-resources-${provider}-${coreDash}`);
      variants.add(`hashicorp__aws-resources-${provider}_${coreUnderscore}`);
      variants.add(`hashicorp__aws-resources-${provider}-${coreDash}`);
    }

    return Array.from(variants).filter(Boolean);
  }

  private buildContextTokens(args: MatchRulesToDiffArgs): string[] {
    const rawTokens: string[] = [];
    if (Array.isArray(args.properties)) {
      rawTokens.push(...args.properties);
    }
    if (args.diffContent) {
      rawTokens.push(...args.diffContent.split(/[^a-zA-Z0-9_:-]+/));
    }

    const stopWords = new Set([
      'resources',
      'resource',
      'properties',
      'property',
      'metadata',
      'type',
      'value',
      'name',
      'ref',
    ]);
    const out = new Set<string>();

    for (const token of rawTokens) {
      const normalized = token
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_:-]+/g, '');
      if (!normalized) {
        continue;
      }
      const pieces = normalized
        .split(/[_:-]+/)
        .map(piece => piece.trim())
        .filter(piece => piece.length >= 3 && !stopWords.has(piece));
      for (const piece of pieces) {
        out.add(piece);
      }
    }

    return Array.from(out);
  }

  private buildServiceMatchTokens(blockType: string): string[] {
    const segments = this.parseCloudFormationTypeSegments(blockType);
    if (!segments || segments.length < 2) {
      return [];
    }

    const provider = segments[0];
    const service = segments[1];
    const variants = new Set<string>([
      `${provider}_${service}`,
      `${provider}-${service}`,
      `aws-resources-${provider}_${service}`,
      `aws-resources-${provider}-${service}`,
      `hashicorp__aws-resources-${provider}_${service}`,
      `hashicorp__aws-resources-${provider}-${service}`,
      service,
    ]);
    return Array.from(variants);
  }

  /**
   * CloudFormation-specific rule matching for ORL file-level rule lists.
   *
   * 1. **Full resource type** — Match rule names against tokens derived from the
   *    block type (e.g. `AWS::S3::Bucket` → `aws_s3_bucket`, provider-prefixed variants).
   * 2. **Service-only fallback** — If no rule matches the full type, narrow by
   *    provider + service (e.g. `aws` + `kms`) so unrelated services (e.g. S3) do not appear.
   *    If we cannot build service tokens, fall back to all file rules.
   * 3. **Tie-break** — When several rules still match the same type, prefer rules
   *    whose names overlap diff/property tokens from the change.
   * 4. **Empty match** — If type and service filters yield nothing, return [] (do not
   *    broaden to unrelated rules).
   */
  override matchRulesToDiff(args: MatchRulesToDiffArgs): string[] {
    const typeTokens = this.buildBlockTypeMatchTokens(args.blockType);
    if (typeTokens.length === 0) {
      return [...args.allFileRules];
    }

    const typeMatched = args.allFileRules.filter(ruleName => {
      const lower = ruleName.toLowerCase();
      return typeTokens.some(token => lower.includes(token));
    });

    if (typeMatched.length === 0) {
      const serviceTokens = this.buildServiceMatchTokens(args.blockType);
      if (serviceTokens.length === 0) {
        return [...args.allFileRules];
      }
      const serviceMatched = args.allFileRules.filter(ruleName => {
        const lower = ruleName.toLowerCase();
        return serviceTokens.some(token => lower.includes(token));
      });
      return serviceMatched;
    }

    if (typeMatched.length === 1) {
      return typeMatched;
    }

    const contextTokens = this.buildContextTokens(args);
    if (contextTokens.length === 0) {
      return typeMatched;
    }

    const withScores = typeMatched.map(ruleName => {
      const lower = ruleName.toLowerCase();
      const score = contextTokens.reduce(
        (acc, token) => acc + (lower.includes(token) ? 1 : 0),
        0
      );
      return { ruleName, score };
    });
    const maxScore = Math.max(...withScores.map(item => item.score));
    if (maxScore <= 0) {
      return typeMatched;
    }

    return withScores
      .filter(item => item.score === maxScore)
      .map(item => item.ruleName);
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

  override formatBlockDisplayName(args: FormatBlockDisplayNameArgs): string {
    return `CloudFormation: ${path.basename(args.filePath)}`;
  }
}

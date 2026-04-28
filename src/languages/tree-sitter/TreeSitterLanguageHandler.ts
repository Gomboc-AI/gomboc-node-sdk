import path from 'path';
import Parser from 'tree-sitter';
import { makeIacPullRequestBody } from '../iac/iacPullRequestBody';
import { makeIacScanReport } from '../iac/iacScanReport';
import {
  BlockDescription,
  BlockRange,
  BuildDiagnosticContextArgs,
  BuildDiagnosticRangeArgs,
  BuildPreviewResourceContextsArgs,
  DescribeBlockArgs,
  DetectLanguageArgs,
  DiagnosticContext,
  DiagnosticRangeResult,
  DocumentInfo,
  FindBlockAtLineArgs,
  FindNearestBlockArgs,
  FindScopedEditRangeArgs,
  FormatBlockDisplayNameArgs,
  GetDocumentInfoArgs,
  ILanguage,
  ListBlocksArgs,
  MatchRulesToDiffArgs,
  PreviewResourceContext,
  ResolveDiagnosticAnchorLineArgs,
  ResourceContextExtractKind,
  ScopedEditRange,
} from '../types';
import {
  buildPreviewResourceContexts,
  PreviewContextRange,
} from '../fixPreview/previewResourceContextBuilder';
import {
  findLastNodeBefore,
  findSmallestEnclosingNode,
  syntaxNodeToBlockRange,
} from './nodeUtils';
import { parseContent } from './parser';
import { compileQuery, runQuery } from './queryUtils';

/**
 * Shared tree-sitter language base class implementing ILanguage directly.
 */
export abstract class TreeSitterLanguageHandler implements ILanguage {
  makeScanReport = makeIacScanReport;
  makePullRequestBody = makeIacPullRequestBody;

  abstract displayName: string;

  diagnosticClearScope: 'file' | 'directory' = 'file';
  codeResourceType = 'unknown';

  abstract detectLanguage(args: DetectLanguageArgs): boolean;
  abstract getDocumentInfo(args: GetDocumentInfoArgs): DocumentInfo;
  abstract getTreeSitterLanguage(): Parser.Language;
  abstract getBlockQuery(): string;

  getResourceContextExtractKind(): ResourceContextExtractKind {
    return 'unknown';
  }

  buildPreviewResourceContexts(
    args: BuildPreviewResourceContextsArgs
  ): PreviewResourceContext[] {
    return buildPreviewResourceContexts({
      ...args,
      kind: this.getResourceContextExtractKind(),
      resolveContextRange: ({ kind, lines, line }) =>
        this.resolvePreviewContextRange({
          kind,
          lines,
          line,
        }),
    });
  }

  protected resolvePreviewContextRange(_args: {
    kind: ResourceContextExtractKind;
    lines: string[];
    line: number;
  }): PreviewContextRange | undefined {
    return undefined;
  }

  /**
   * Tree-sitter powered block discovery. Subclasses provide a query that captures
   * block nodes (preferably as @block) and optional names (as @name).
   */
  listBlocks(args: ListBlocksArgs): BlockRange[] {
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
      const nameCapture = match.captures.find(
        capture => capture.name === 'name'
      );

      blocks.push(syntaxNodeToBlockRange(blockCapture.node, nameCapture?.node));
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
   * Finds the smallest discovered block containing the provided 1-based line.
   */
  findBlockAtLine(args: FindBlockAtLineArgs): BlockRange | null {
    const blocks = this.listBlocks(args);
    const containing = blocks.filter(
      block => block.startLine <= args.line && block.endLine >= args.line
    );
    if (containing.length === 0) {
      return null;
    }

    return containing.reduce((best, candidate) => {
      const bestSpan = best.endLine - best.startLine;
      const candidateSpan = candidate.endLine - candidate.startLine;
      if (candidateSpan < bestSpan) {
        return candidate;
      }
      if (candidateSpan === bestSpan && candidate.startLine >= best.startLine) {
        return candidate;
      }
      return best;
    });
  }

  /**
   * Finds the containing block, or the closest block starting at/before the line.
   */
  findNearestBlock(args: FindNearestBlockArgs): BlockRange | null {
    const containing = this.findBlockAtLine(args);
    if (containing) {
      return containing;
    }

    const blocks = this.listBlocks(args).filter(
      block => block.startLine <= args.line
    );
    if (blocks.length === 0) {
      return null;
    }

    return blocks.reduce((best, candidate) =>
      candidate.startLine >= best.startLine ? candidate : best
    );
  }

  /**
   * Provides a scoped edit range using the current or nearest block.
   */
  findScopedEditRange(args: FindScopedEditRangeArgs): ScopedEditRange | null {
    const block = this.findBlockAtLine(args) || this.findNearestBlock(args);
    if (!block) {
      return null;
    }
    return { startLine: block.startLine, endLine: block.endLine };
  }

  /**
   * Builds diagnostic context with block metadata used by downstream formatters.
   */
  buildDiagnosticContext(args: BuildDiagnosticContextArgs): DiagnosticContext {
    const block = this.findBlockAtLine({
      filePath: args.filePath,
      content: args.content,
      line: args.hint.line,
    });
    const nearestBlock =
      block ||
      this.findNearestBlock({
        filePath: args.filePath,
        content: args.content,
        line: args.hint.line,
      });
    const docInfo = this.getDocumentInfo({
      filePath: args.filePath,
      content: args.content,
    });

    return {
      languageId: docInfo.languageId,
      filePath: args.filePath,
      block: block || undefined,
      nearestBlock: nearestBlock || undefined,
      diagnosticAnchorLine:
        (block || nearestBlock)?.startLine || Math.max(1, args.hint.line),
      blockHeader:
        (block || nearestBlock)?.header || path.basename(args.filePath),
      fallbackBlock: !(block || nearestBlock),
      tags: [],
    };
  }

  /**
   * Marks lines that are usually poor semantic anchors in diffs.
   */
  isWeakAnchorLine(line: string): boolean {
    const trimmed = line.trim();
    return (
      trimmed.length === 0 ||
      trimmed === '{' ||
      trimmed === '}' ||
      trimmed === '],' ||
      trimmed === ']' ||
      trimmed === '},' ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('//')
    );
  }

  /**
   * Default line grouping strategy for related diff lines.
   */
  groupRelatedLines(lines: string[]): string[][] {
    const groups: string[][] = [];
    let currentGroup: string[] = [];
    let braceDepth = 0;

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (
        !trimmedLine ||
        trimmedLine.startsWith('#') ||
        trimmedLine.startsWith('//')
      ) {
        if (currentGroup.length > 0) {
          currentGroup.push(line);
        }
        continue;
      }

      const openBraces = (line.match(/{/g) || []).length;
      const closeBraces = (line.match(/}/g) || []).length;
      braceDepth += openBraces - closeBraces;

      currentGroup.push(line);

      if (braceDepth === 0 && currentGroup.length > 0) {
        groups.push([...currentGroup]);
        currentGroup = [];
      }
    }

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    if (groups.length === 0 && lines.length > 0) {
      groups.push(lines);
    }

    return groups;
  }

  /**
   * Builds a compact character range on a single 1-based line for highlighting.
   */
  buildDiagnosticRange(args: BuildDiagnosticRangeArgs): DiagnosticRangeResult {
    const line = Math.max(1, Math.floor(args.line1Based || 1));
    const uniqueOffset =
      Number.isFinite(args.uniqueOffset) && (args.uniqueOffset || 0) > 0
        ? Math.floor(args.uniqueOffset || 0)
        : 0;
    const text =
      typeof args.content === 'string' && args.content.length > 0
        ? args.content
        : '';
    const lines = text ? text.split('\n') : [];
    const idx = Math.min(Math.max(0, line - 1), Math.max(0, lines.length - 1));
    const lineText = lines[idx] || '';
    const lineLength = lineText.length;

    const firstNonWhitespace = lineText.search(/\S/);
    const startChar =
      firstNonWhitespace >= 0 ? firstNonWhitespace : lineLength > 0 ? 0 : 0;

    const trimmedLength = lineText.trim().length;
    const compactWidth = Math.max(1, Math.min(24, trimmedLength || 1));
    const maxEnd = Math.max(startChar + 1, lineLength || startChar + 1);
    const rawEnd = startChar + compactWidth + uniqueOffset;
    const endChar = Math.min(maxEnd, Math.max(startChar + 1, rawEnd));

    return { startChar, endChar };
  }

  /**
   * Resolves a stable 1-based diagnostic anchor line using AST structure:
   * - existing line: smallest enclosing named node
   * - insertion past EOF: last named node before insertion
   * - fallback: first line
   */
  resolveDiagnosticAnchorLine(args: ResolveDiagnosticAnchorLineArgs): number {
    const language = this.getTreeSitterLanguage();
    const tree = parseContent(language, args.content);
    const maxLine = tree.rootNode.endPosition.row + 1;
    const suggestedLine =
      Number.isFinite(args.suggestedLine) && args.suggestedLine > 0
        ? Math.floor(args.suggestedLine)
        : 1;
    const suggestedRow = suggestedLine - 1;

    let resolvedLine = 1;

    if (suggestedRow <= tree.rootNode.endPosition.row) {
      const enclosingNode = findSmallestEnclosingNode(
        tree.rootNode,
        suggestedRow
      );
      if (enclosingNode) {
        resolvedLine = enclosingNode.startPosition.row + 1;
      }
    } else {
      const previousNode = findLastNodeBefore(tree.rootNode, suggestedRow - 1);
      if (previousNode) {
        resolvedLine = previousNode.startPosition.row + 1;
      }
    }

    return Math.min(maxLine, Math.max(1, resolvedLine));
  }

  /**
   * Converts block context into the converter-friendly block description shape.
   */
  describeBlock(args: DescribeBlockArgs): BlockDescription {
    const block =
      args.block ||
      this.findBlockAtLine({
        filePath: args.filePath,
        content: args.content,
        line: args.line,
      }) ||
      this.findNearestBlock({
        filePath: args.filePath,
        content: args.content,
        line: args.line,
      });

    if (block) {
      return {
        blockType: block.type,
        blockName: block.name || null,
        blockStartLine: block.startLine - 1,
        blockEndLine: block.endLine - 1,
      };
    }

    return {
      blockType: 'Resource',
      blockName: null,
      blockStartLine: -1,
      blockEndLine: -1,
    };
  }

  /**
   * Formats a user-facing block display name with sensible fallbacks.
   */
  formatBlockDisplayName(args: FormatBlockDisplayNameArgs): string {
    if (
      args.blockType &&
      args.blockType !== 'Resource' &&
      args.blockName?.trim()
    ) {
      return `${args.blockType}.${args.blockName}`;
    }
    if (args.blockType && args.blockType !== 'Resource') {
      return args.blockType;
    }
    return path.basename(args.filePath);
  }

  /**
   * Default rule matching strategy: apply all file-level rules.
   */
  matchRulesToDiff(args: MatchRulesToDiffArgs): string[] {
    return [...args.allFileRules];
  }
}

import Parser from 'tree-sitter';
import { BlockRange } from '../types';

/**
 * Converts a tree-sitter syntax node to a BlockRange.
 */
export function syntaxNodeToBlockRange(
  node: Parser.SyntaxNode,
  nameCapture?: Parser.SyntaxNode
): BlockRange {
  const firstLine = node.text.split('\n', 1)[0] || '';

  return {
    type: node.type,
    name: nameCapture?.text,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    header: firstLine,
  };
}

/**
 * Finds the smallest named node containing a 0-based row.
 */
export function findSmallestEnclosingNode(
  root: Parser.SyntaxNode,
  row: number
): Parser.SyntaxNode | null {
  if (row < root.startPosition.row || row > root.endPosition.row) {
    return null;
  }

  let best: Parser.SyntaxNode | null = null;

  const visit = (node: Parser.SyntaxNode): void => {
    if (!node.isNamed) {
      return;
    }

    const startRow = node.startPosition.row;
    const endRow = node.endPosition.row;
    if (row < startRow || row > endRow) {
      return;
    }

    if (!best) {
      best = node;
    } else {
      const bestSpan = best.endPosition.row - best.startPosition.row;
      const candidateSpan = endRow - startRow;
      if (
        candidateSpan < bestSpan ||
        (candidateSpan === bestSpan && startRow >= best.startPosition.row)
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

/**
 * Finds the last named node ending at or before a 0-based row.
 */
export function findLastNodeBefore(
  root: Parser.SyntaxNode,
  row: number
): Parser.SyntaxNode | null {
  if (row < 0) {
    return null;
  }

  let best: Parser.SyntaxNode | null = null;

  const visit = (node: Parser.SyntaxNode): void => {
    if (!node.isNamed) {
      return;
    }

    const startRow = node.startPosition.row;
    if (startRow > row) {
      return;
    }

    const endRow = node.endPosition.row;
    if (endRow <= row) {
      if (
        !best ||
        endRow > best.endPosition.row ||
        (endRow === best.endPosition.row &&
          startRow >= best.startPosition.row)
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

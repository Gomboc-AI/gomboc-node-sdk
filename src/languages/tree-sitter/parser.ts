import Parser from 'tree-sitter';

const parserCache = new Map<Parser.Language, Parser>();

/**
 * Returns a cached parser instance for the provided tree-sitter language.
 */
export function getParser(language: Parser.Language): Parser {
  const cached = parserCache.get(language);
  if (cached) {
    return cached;
  }

  const parser = new Parser();
  parser.setLanguage(language);
  parserCache.set(language, parser);

  return parser;
}

/**
 * Parses content using a cached parser for the provided language.
 */
export function parseContent(
  language: Parser.Language,
  content: string
): Parser.Tree {
  const parser = getParser(language);
  return parser.parse(content);
}

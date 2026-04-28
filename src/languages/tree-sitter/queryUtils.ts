import Parser from 'tree-sitter';

const queryCache = new WeakMap<Parser.Language, Map<string, Parser.Query>>();

/**
 * Compiles and caches tree-sitter queries by language + query text.
 */
export function compileQuery(
  language: Parser.Language,
  queryString: string
): Parser.Query {
  let languageQueries = queryCache.get(language);
  if (!languageQueries) {
    languageQueries = new Map<string, Parser.Query>();
    queryCache.set(language, languageQueries);
  }

  const cached = languageQueries.get(queryString);
  if (cached) {
    return cached;
  }

  const compiled = new Parser.Query(language, queryString);
  languageQueries.set(queryString, compiled);

  return compiled;
}

/**
 * Runs a compiled query against a syntax tree root.
 */
export function runQuery(
  tree: Parser.Tree,
  query: Parser.Query
): Parser.QueryMatch[] {
  return query.matches(tree.rootNode);
}

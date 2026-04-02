/**
 * Rules/classifications search queries often exclude deprecated items via this clause.
 */
export const DEPRECATED_FILTER =
  '(not (eq $.annotations["deprecated"] "true"))' as const;

export type WithIncludeDeprecated<T> = T & { includeDeprecated?: boolean };
type SearchParamsWithQuery = { query?: string };

/**
 * Removes `includeDeprecated` so the object matches rules/classifications search API params.
 */
export function omitIncludeDeprecated<
  T extends { includeDeprecated?: boolean },
>(args: T | undefined): Omit<T, 'includeDeprecated'> {
  if (args == null) {
    return {} as Omit<T, 'includeDeprecated'>;
  }
  const { includeDeprecated: _omit, ...rest } = args;
  return rest as Omit<T, 'includeDeprecated'>;
}

/**
 * Builds the `query` string for rules or classifications search.
 * When `includeDeprecated` is false/omitted, results exclude deprecated items.
 * When true, `query` is passed through; if undefined, callers typically omit `query` (unfiltered list, API-dependent).
 */
export function mergeSearchQueryWithDeprecatedFilter(
  query: string | undefined,
  includeDeprecated: boolean | undefined,
): string | undefined {
  if (includeDeprecated) {
    return query;
  }
  if (!query) {
    return DEPRECATED_FILTER;
  }
  return `(and ${query} ${DEPRECATED_FILTER})`;
}

/**
 * Normalizes search params by handling optional `includeDeprecated` and returning
 * a params object that only includes `query` when needed.
 */
export function buildSearchParamsWithDeprecatedOption<
  T extends SearchParamsWithQuery,
>(args?: WithIncludeDeprecated<T>): T {
  const includeDeprecated = args?.includeDeprecated ?? false;
  const base = omitIncludeDeprecated(args) as T;
  const query = mergeSearchQueryWithDeprecatedFilter(
    base.query,
    includeDeprecated,
  );

  if (query === undefined) {
    const { query: _omit, ...rest } = base as T & SearchParamsWithQuery;
    return rest as T;
  }

  return {
    ...base,
    query,
  };
}

/**
 * Builds an OR query matching any provided classification names.
 */
export function buildOrNameQuery(names: string[]): string | undefined {
  if (names.length === 0) {
    return undefined;
  }
  return `(or ${names.map(name => `(eq $.name "${name}")`).join('')})`;
}

/**
 * Appends the deprecated filter to a channel/classification query when missing.
 * Handles top-level `(and …)` / `(or …)` and avoids double-appending the filter.
 */
export function ensureDeprecatedFilterOnQuery(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return query;

  const hasDeprecatedFilter =
    /\s*\(\s*not\s*\(\s*eq\s+\$\.annotations\["deprecated"\]\s+"true"\s*\)\s*\)\s*\)\s*$/i.test(
      trimmed,
    );
  if (hasDeprecatedFilter) return query;

  const deprecationClause = ` ${DEPRECATED_FILTER}`;

  if (/^\s*\(\s*and\s*/i.test(trimmed)) {
    let depth = 0;
    let i = 0;
    while (i < trimmed.length) {
      const c = trimmed[i];
      if (c === '(') depth++;
      else if (c === ')') {
        depth--;
        if (depth === 0) {
          return (
            trimmed.substring(0, i) + deprecationClause + trimmed.substring(i)
          );
        }
      }
      i++;
    }
  }

  if (/^\s*\(\s*or\s*/i.test(trimmed)) {
    return `(and ${trimmed} ${DEPRECATED_FILTER})`;
  }

  return `(and (or ${trimmed}) ${DEPRECATED_FILTER})`;
}

import { ensureDeprecatedFilterOnQuery } from '../sdk';

/** Matches policy name in (contains "name" finding.classification) clauses. */
export const POLICY_SET_POLICY_NAME_REGEX =
  /.*?\(contains\s+"([^"]+)"\s+finding\.classification\).*?/g;

/** Matches policy names in (contains "name" $.classification) clauses. */
export const POLICY_QUERY_SUBSTRING =
  /\(contains\s+"([^"]+)"\s+\$\.classification\)/g;

export function parseExceptionRuleNamesFromQuery(query: string): string[] {
  if (!query.trim()) {
    return [];
  }

  const names: string[] = [];
  const re = /\(eq \$\.name "([^"]*)"\)/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(query)) !== null) {
    names.push(match[1]);
  }

  return names;
}

export function isQueryEmpty(queryString: string): boolean {
  const trimmed = queryString.trim();
  const orPrefix = /^\s*\(\s*or\s*/i;
  const andOrPrefix = /^\s*\(\s*and\s*\(\s*or\s*/i;

  let openParenIndex: number;
  if (andOrPrefix.test(trimmed)) {
    const firstParen = trimmed.indexOf('(');
    openParenIndex = trimmed.indexOf('(', firstParen + 1);
  } else if (orPrefix.test(trimmed)) {
    openParenIndex = trimmed.indexOf('(');
  } else {
    return false;
  }

  if (openParenIndex === -1) {
    return false;
  }

  let depth = 0;
  for (let i = openParenIndex; i < trimmed.length; i++) {
    const c = trimmed[i];
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) {
        const inner = trimmed.substring(openParenIndex + 1, i);
        return !/[()]/.test(inner);
      }
    }
  }

  return false;
}

export function getPolicyNamesFromQuery(query: string): string[] {
  const matches = query.matchAll(POLICY_SET_POLICY_NAME_REGEX);
  return Array.from(matches, match => match[1]);
}

export function getPolicyCountFromChannelQuery(channelQuery: string): number {
  return getPolicyNamesFromQuery(channelQuery).length;
}

export function getPolicySetQuery(updatedPolicyNameList: string[]): string {
  const uniquePolicyNames = [...new Set(updatedPolicyNameList)];
  const updatedPolicyQueries = uniquePolicyNames.map(
    name => `(contains "${name}" finding.classification)`
  );
  const newPolicySetQuery = `(or ${updatedPolicyQueries.join(' ')})`;

  if (newPolicySetQuery === '(or )') {
    return '';
  }

  return ensureDeprecatedFilterOnQuery(newPolicySetQuery);
}

export function attachPolicySetToWorkspaceChannelQuery(
  workspaceQuery: string = '',
  policySetChannelName: string
): string {
  const trimmedWorkspaceQuery = workspaceQuery.trim();
  const escapedChannelName = policySetChannelName.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&'
  );

  if (
    new RegExp(`${escapedChannelName}(?=[\\s"])`).test(trimmedWorkspaceQuery)
  ) {
    return ensureDeprecatedFilterOnQuery(workspaceQuery);
  }

  const startsWithAnd = /^\s*\(\s*and\s*/i.test(trimmedWorkspaceQuery);
  const startsWithAndOr = /^\s*\(\s*and\s*\(\s*or\s*/i.test(
    trimmedWorkspaceQuery
  );
  const policySetChannel = `(channel "${policySetChannelName}" true)`;

  if (startsWithAndOr) {
    const firstOrMatch = trimmedWorkspaceQuery.match(/\(\s*or\s/i);
    const openParenIndex =
      firstOrMatch && firstOrMatch.index !== undefined
        ? firstOrMatch.index
        : -1;
    let insertAtIndex = -1;
    if (openParenIndex !== -1) {
      let depth = 0;
      for (let i = openParenIndex; i < trimmedWorkspaceQuery.length; i++) {
        const c = trimmedWorkspaceQuery[i];
        if (c === '(') depth++;
        else if (c === ')') {
          depth--;
          if (depth === 0) {
            insertAtIndex = i;
            break;
          }
        }
      }
    }
    if (insertAtIndex !== -1) {
      const beforeInsert = trimmedWorkspaceQuery.substring(0, insertAtIndex);
      const afterInsert = trimmedWorkspaceQuery.substring(insertAtIndex);
      return ensureDeprecatedFilterOnQuery(
        `${beforeInsert} ${policySetChannel}${afterInsert}`
      );
    }
    return ensureDeprecatedFilterOnQuery(workspaceQuery);
  }

  if (startsWithAnd) {
    const andMatch = trimmedWorkspaceQuery.match(/^\s*\(\s*and\s*/i);
    if (andMatch) {
      const indexAfterAnd = andMatch.index! + andMatch[0].length;
      const innerContent = trimmedWorkspaceQuery.substring(
        indexAfterAnd,
        trimmedWorkspaceQuery.length - 1
      );
      return ensureDeprecatedFilterOnQuery(
        `(and (or ${innerContent} ${policySetChannel}))`
      );
    }
    return ensureDeprecatedFilterOnQuery(workspaceQuery);
  }

  return ensureDeprecatedFilterOnQuery(
    `(and (or ${trimmedWorkspaceQuery} ${policySetChannel}))`
  );
}

export function getPolicySetNamesFromChannelQuery(
  query: string,
  accountId: string
): string[] {
  if (!query?.trim()) {
    return [];
  }

  const prefix = `${accountId}/set/`;
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\(channel\\s+"${escapedPrefix}([^"]+)"`, 'g');
  const names: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(query)) !== null) {
    names.push(match[1]);
  }

  return names;
}

export function removePolicySetFromWorkspaceChannelQuery(
  policySetChannelName: string,
  workspaceChannelQuery?: string
): string | undefined {
  if (workspaceChannelQuery == null) {
    return;
  }

  const escapedChannelName = policySetChannelName.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&'
  );
  const policySetQuery = new RegExp(
    `\\(\\s*channel\\s+"${escapedChannelName}"\\s*true\\s*\\)`
  );
  const finalQuery = workspaceChannelQuery.replace(policySetQuery, '').trim();

  if (isQueryEmpty(finalQuery)) {
    return '';
  }
  if (!/\(\s*channel\s+"/.test(finalQuery)) {
    return '';
  }

  return finalQuery;
}

export function escapeChannelPathForChannelPredicate(path: string): string {
  return path.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function policySetExceptionChannelFilterClause(
  exceptionChannelName: string
): string {
  const escaped = escapeChannelPathForChannelPredicate(
    exceptionChannelName.trim()
  );
  return `(channel "${escaped}" true)`;
}

export function policySetFiltersAlreadyReferenceExceptionChannel(
  currentFilters: string[],
  exceptionChannelName: string
): boolean {
  const name = exceptionChannelName.trim();
  if (!name) {
    return true;
  }

  return currentFilters.includes(policySetExceptionChannelFilterClause(name));
}

export function mergePolicySetFiltersWithExceptionChannelName(
  currentFilters: string[],
  exceptionChannelName: string
): string[] {
  const name = exceptionChannelName.trim();
  if (!name) {
    return currentFilters;
  }
  if (policySetFiltersAlreadyReferenceExceptionChannel(currentFilters, name)) {
    return currentFilters;
  }

  return [...currentFilters, policySetExceptionChannelFilterClause(name)];
}

export function filtersWithoutExceptionChannelClause(
  filters: string[],
  exceptionChannelName: string
): string[] {
  const clause = policySetExceptionChannelFilterClause(exceptionChannelName);
  return filters.filter(filter => filter !== clause);
}

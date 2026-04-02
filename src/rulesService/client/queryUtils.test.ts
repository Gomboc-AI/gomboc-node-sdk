import {
  attachPolicySetToWorkspaceChannelQuery,
  getPolicySetNamesFromChannelQuery,
  getPolicySetQuery,
  isQueryEmpty,
  parseExceptionRuleNamesFromQuery,
  removePolicySetFromWorkspaceChannelQuery,
} from './queryUtils';

describe('queryUtils', () => {
  describe('getPolicySetQuery', () => {
    it('returns empty string for empty policy names array', () => {
      expect(getPolicySetQuery([])).toBe('');
    });

    it('builds a single-policy query wrapped with deprecated filter', () => {
      expect(getPolicySetQuery(['gomboc-ai/policy/s3'])).toBe(
        '(and (or (contains "gomboc-ai/policy/s3" finding.classification)) (not (eq $.annotations["deprecated"] "true")))'
      );
    });

    it('deduplicates policy names', () => {
      const result = getPolicySetQuery(['p', 'p', 'p']);
      const matches = result.match(/\(contains "p" finding\.classification\)/g);
      expect(matches).toHaveLength(1);
    });
  });

  describe('isQueryEmpty', () => {
    it('returns true for "(or )"', () => {
      expect(isQueryEmpty('(or )')).toBe(true);
    });

    it('returns false for non-empty query', () => {
      expect(isQueryEmpty('(or (contains "x" finding.classification))')).toBe(
        false
      );
    });
  });

  describe('parseExceptionRuleNamesFromQuery', () => {
    it('extracts rule names from a multi-clause query', () => {
      expect(
        parseExceptionRuleNamesFromQuery(
          '(or (eq $.name "gomboc-ai/rule-a") (eq $.name "gomboc-ai/rule-b"))'
        )
      ).toEqual(['gomboc-ai/rule-a', 'gomboc-ai/rule-b']);
    });

    it('returns empty array for blank query', () => {
      expect(parseExceptionRuleNamesFromQuery('  ')).toEqual([]);
    });
  });

  describe('workspace channel helpers', () => {
    const DEPRECATED = '(not (eq $.annotations["deprecated"] "true"))';

    it('extracts policy set names from channel query', () => {
      const query = `(and (or (channel "acct-1/set/default" true) (channel "acct-1/set/platform" true)) ${DEPRECATED})`;
      expect(getPolicySetNamesFromChannelQuery(query, 'acct-1')).toEqual([
        'default',
        'platform',
      ]);
    });

    it('attaches policy set channel and is idempotent', () => {
      const initial = attachPolicySetToWorkspaceChannelQuery(
        '',
        'acct-1/set/my-ps'
      );
      expect(initial).toContain('(channel "acct-1/set/my-ps" true)');

      const next = attachPolicySetToWorkspaceChannelQuery(
        initial,
        'acct-1/set/my-ps'
      );
      const channelMatches = next.match(
        /\(channel "acct-1\/set\/my-ps" true\)/g
      );
      expect(channelMatches).toHaveLength(1);
    });

    it('removes policy set channel and returns empty for last channel', () => {
      const query = `(and (or (channel "acct-1/set/only-ps" true)) ${DEPRECATED})`;
      expect(
        removePolicySetFromWorkspaceChannelQuery('acct-1/set/only-ps', query)
      ).toBe('');
    });
  });
});

import { PoliciesHandler } from './policiesHandler';
import { Policy, Rule } from './types';

function makePolicy(overrides: Partial<Policy> = {}): Policy {
  return {
    id: 'gomboc-ai/policy/test',
    name: 'Test Policy',
    description: null,
    annotations: null,
    ...overrides,
  };
}

describe('PoliciesHandler', () => {
  describe('filter', () => {
    it('returns all policies when name term is empty', () => {
      const policies = [
        makePolicy({ name: 'Alpha' }),
        makePolicy({ name: 'Beta' }),
      ];
      const handler = PoliciesHandler.init({ policies });
      expect(handler.filter('')).toHaveLength(2);
    });

    it('returns all policies when name term is a single character', () => {
      const policies = [
        makePolicy({ name: 'Alpha' }),
        makePolicy({ name: 'Beta' }),
      ];
      const handler = PoliciesHandler.init({ policies });
      expect(handler.filter('a')).toHaveLength(2);
    });

    it('performs case-insensitive substring match on name', () => {
      const policies = [
        makePolicy({ name: 'S3 Public Access Block' }),
        makePolicy({ name: 'IAM Role Policy' }),
      ];
      const handler = PoliciesHandler.init({ policies });
      expect(handler.filter('s3')).toEqual([policies[0]]);
      expect(handler.filter('IAM')).toEqual([policies[1]]);
      expect(handler.filter('policy')).toEqual([policies[1]]);
    });

    it('filters by annotation key and value (newline-separated)', () => {
      const policies = [
        makePolicy({
          name: 'Policy A',
          annotations: { 'gomboc-ai/categories': 'storage\nnetworking' },
        }),
        makePolicy({
          name: 'Policy B',
          annotations: { 'gomboc-ai/categories': 'iam' },
        }),
      ];
      const handler = PoliciesHandler.init({ policies });
      const result = handler.filter('', [
        { key: 'gomboc-ai/categories', value: 'storage' },
      ]);
      expect(result).toEqual([policies[0]]);
    });

    it('returns a policy if it matches any of the provided annotation filters (OR semantics)', () => {
      const policies = [
        makePolicy({
          name: 'A',
          annotations: { 'gomboc-ai/iac': 'terraform' },
        }),
        makePolicy({ name: 'B', annotations: { 'gomboc-ai/iac': 'cdk' } }),
        makePolicy({ name: 'C', annotations: { 'gomboc-ai/iac': 'pulumi' } }),
      ];
      const handler = PoliciesHandler.init({ policies });
      const result = handler.filter('', [
        { key: 'gomboc-ai/iac', value: 'terraform' },
        { key: 'gomboc-ai/iac', value: 'cdk' },
      ]);
      expect(result.map(p => p.name)).toEqual(['A', 'B']);
    });

    it('excludes policies with no annotations when annotation filter is active', () => {
      const policies = [
        makePolicy({ name: 'No Annotations', annotations: null }),
        makePolicy({
          name: 'Has Annotation',
          annotations: { 'gomboc-ai/iac': 'terraform' },
        }),
      ];
      const handler = PoliciesHandler.init({ policies });
      const result = handler.filter('', [
        { key: 'gomboc-ai/iac', value: 'terraform' },
      ]);
      expect(result).toEqual([policies[1]]);
    });

    it('combines name and annotation filters', () => {
      const policies = [
        makePolicy({
          name: 'S3 Encryption',
          annotations: { 'gomboc-ai/iac': 'terraform' },
        }),
        makePolicy({
          name: 'S3 Access Block',
          annotations: { 'gomboc-ai/iac': 'cdk' },
        }),
        makePolicy({
          name: 'IAM Policy',
          annotations: { 'gomboc-ai/iac': 'terraform' },
        }),
      ];
      const handler = PoliciesHandler.init({ policies });
      const result = handler.filter('S3', [
        { key: 'gomboc-ai/iac', value: 'terraform' },
      ]);
      expect(result).toEqual([policies[0]]);
    });
  });

  describe('getAnnotationTypes', () => {
    it('returns sorted unique annotation keys from all policies', () => {
      const policies = [
        makePolicy({
          annotations: {
            'gomboc-ai/iac': 'terraform',
            'gomboc-ai/categories': 'storage',
          },
        }),
        makePolicy({
          annotations: { 'gomboc-ai/iac': 'cdk', 'gomboc-ai/providers': 'aws' },
        }),
      ];
      const handler = PoliciesHandler.init({ policies });
      expect(handler.getAnnotationTypes()).toEqual([
        'gomboc-ai/categories',
        'gomboc-ai/iac',
        'gomboc-ai/providers',
      ]);
    });

    it('returns empty array when no policies have annotations', () => {
      const handler = PoliciesHandler.init({ policies: [makePolicy()] });
      expect(handler.getAnnotationTypes()).toEqual([]);
    });
  });

  describe('getAnnotations', () => {
    it('returns all annotations when no keys filter is provided', () => {
      const policies = [
        makePolicy({ annotations: { 'gomboc-ai/iac': 'terraform' } }),
      ];
      const handler = PoliciesHandler.init({ policies });
      const all = handler.getAnnotations();
      expect(all).toContainEqual({ key: 'gomboc-ai/iac', value: 'terraform' });
    });

    it('filters by provided keys', () => {
      const policies = [
        makePolicy({
          annotations: {
            'gomboc-ai/iac': 'terraform',
            'gomboc-ai/providers': 'aws',
          },
        }),
      ];
      const handler = PoliciesHandler.init({ policies });
      const result = handler.getAnnotations(['gomboc-ai/iac']);
      expect(result).toEqual([{ key: 'gomboc-ai/iac', value: 'terraform' }]);
    });

    it('returns empty array when no keys match', () => {
      const handler = PoliciesHandler.init({ policies: [makePolicy()] });
      expect(handler.getAnnotations(['nonexistent'])).toEqual([]);
    });
  });

  describe('formatAnnotationValue', () => {
    it('joins newline-separated values with comma-space', () => {
      expect(PoliciesHandler.formatAnnotationValue('terraform\ncdk')).toBe(
        'terraform, cdk',
      );
    });

    it('returns single value unchanged (no comma)', () => {
      expect(PoliciesHandler.formatAnnotationValue('terraform')).toBe(
        'terraform',
      );
    });

    it('returns empty string for null', () => {
      expect(PoliciesHandler.formatAnnotationValue(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(PoliciesHandler.formatAnnotationValue(undefined)).toBe('');
    });

    it('filters blank lines', () => {
      expect(PoliciesHandler.formatAnnotationValue('a\n\nb')).toBe('a, b');
    });
  });

  describe('getAnnotationValue', () => {
    it('reads and formats a string annotation value', () => {
      const annotations = { 'gomboc-ai/iac': 'terraform\ncdk' };
      expect(
        PoliciesHandler.getAnnotationValue(annotations, 'gomboc-ai/iac'),
      ).toBe('terraform, cdk');
    });

    it('returns empty string for missing key', () => {
      expect(PoliciesHandler.getAnnotationValue({}, 'missing')).toBe('');
    });

    it('returns empty string for null annotations', () => {
      expect(PoliciesHandler.getAnnotationValue(null, 'any')).toBe('');
    });
  });

  describe('getAnnotationValueNoReformat', () => {
    it('returns the raw string without joining newlines', () => {
      const annotations = { 'gomboc-ai/iac': 'terraform\ncdk' };
      expect(
        PoliciesHandler.getAnnotationValueNoReformat(
          annotations,
          'gomboc-ai/iac',
        ),
      ).toBe('terraform\ncdk');
    });

    it('returns empty string for missing key', () => {
      expect(PoliciesHandler.getAnnotationValueNoReformat({}, 'missing')).toBe(
        '',
      );
    });

    it('returns empty string for null annotations', () => {
      expect(PoliciesHandler.getAnnotationValueNoReformat(null, 'any')).toBe(
        '',
      );
    });
  });

  describe('getAnnotationValueList', () => {
    it('splits a newline-separated string into an array', () => {
      const annotations = { 'gomboc-ai/iac': 'terraform\ncdk\npulumi' };
      expect(
        PoliciesHandler.getAnnotationValueList(annotations, 'gomboc-ai/iac'),
      ).toEqual(['terraform', 'cdk', 'pulumi']);
    });

    it('returns a single-element array for a non-newline string', () => {
      expect(
        PoliciesHandler.getAnnotationValueList({ key: 'val' }, 'key'),
      ).toEqual(['val']);
    });

    it('returns empty array for null annotations', () => {
      expect(PoliciesHandler.getAnnotationValueList(null, 'any')).toEqual([]);
    });

    it('returns empty array for missing key', () => {
      expect(PoliciesHandler.getAnnotationValueList({}, 'missing')).toEqual([]);
    });
  });

  describe('getPoliciesIac', () => {
    it('collects and deduplicates iac values across policies', () => {
      const policies = [
        makePolicy({ annotations: { 'gomboc-ai/iac': 'terraform\ncdk' } }),
        makePolicy({ annotations: { 'gomboc-ai/iac': 'terraform' } }),
      ];
      expect(PoliciesHandler.getPoliciesIac(policies)).toEqual([
        'terraform',
        'cdk',
      ]);
    });

    it('returns empty array when no policies have iac annotation', () => {
      expect(PoliciesHandler.getPoliciesIac([makePolicy()])).toEqual([]);
    });
  });

  describe('getPoliciesProviders', () => {
    it('collects and deduplicates provider values', () => {
      const policies = [
        makePolicy({ annotations: { 'gomboc-ai/providers': 'aws\ngcp' } }),
        makePolicy({ annotations: { 'gomboc-ai/providers': 'aws' } }),
      ];
      expect(PoliciesHandler.getPoliciesProviders(policies)).toEqual([
        'aws',
        'gcp',
      ]);
    });
  });

  describe('getPoliciesCategories', () => {
    it('collects and deduplicates category values', () => {
      const policies = [
        makePolicy({
          annotations: { 'gomboc-ai/categories': 'storage\nnetworking' },
        }),
        makePolicy({ annotations: { 'gomboc-ai/categories': 'networking' } }),
      ];
      expect(PoliciesHandler.getPoliciesCategories(policies)).toEqual([
        'storage',
        'networking',
      ]);
    });
  });

  describe('getPoliciesImpactScore', () => {
    it('returns impact score for each policy in order', () => {
      const policies = [
        makePolicy({
          annotations: {
            'gomboc-ai/impact/score': 'high',
          },
        }),
        makePolicy({
          annotations: {
            'gomboc-ai/impact/score': 'medium',
          },
        }),
      ];
      expect(PoliciesHandler.getPoliciesImpactScore(policies)).toEqual([
        'high',
        'medium',
      ]);
    });

    it('returns empty string for policies without impact score', () => {
      expect(PoliciesHandler.getPoliciesImpactScore([makePolicy()])).toEqual([
        '',
      ]);
    });
  });

  describe('getPoliciesImpactStatement', () => {
    it('returns impact statements as-is by default', () => {
      const policies = [
        makePolicy({
          annotations: {
            'gomboc-ai/impact/statement': '## Impact\n\nSome impact text',
          },
        }),
      ];
      expect(PoliciesHandler.getPoliciesImpactStatement(policies)).toEqual([
        '## Impact\n\nSome impact text',
      ]);
    });

    it('strips the ## Impact heading when clean is true', () => {
      const policies = [
        makePolicy({
          annotations: {
            'gomboc-ai/impact/statement': '## Impact\nSome impact text',
          },
        }),
      ];
      expect(
        PoliciesHandler.getPoliciesImpactStatement(policies, { clean: true }),
      ).toEqual(['Some impact text']);
    });

    it('returns empty string when annotation is absent', () => {
      expect(
        PoliciesHandler.getPoliciesImpactStatement([makePolicy()]),
      ).toEqual(['']);
    });
  });

  describe('removeMarkdownFromDescription', () => {
    it('strips the ## Description heading from the first policy', () => {
      const policies = [
        makePolicy({ description: '## Description\n\nThis is the body.' }),
      ];
      expect(PoliciesHandler.removeMarkdownFromDescription(policies)).toBe(
        'This is the body.',
      );
    });

    it('returns the description unchanged when there is no heading', () => {
      const policies = [makePolicy({ description: 'Plain description.' })];
      expect(PoliciesHandler.removeMarkdownFromDescription(policies)).toBe(
        'Plain description.',
      );
    });

    it('returns empty string for empty policies array', () => {
      expect(PoliciesHandler.removeMarkdownFromDescription([])).toBe('');
    });

    it('returns empty string when first policy has no description', () => {
      expect(
        PoliciesHandler.removeMarkdownFromDescription([
          makePolicy({ description: null }),
        ]),
      ).toBe('');
    });
  });

  describe('getResourceTypesFromRules', () => {
    it('extracts and deduplicates resource types from rules', () => {
      const rules = [
        { annotations: { 'gomboc-ai/resource': 'aws_s3_bucket' } },
        { annotations: { 'gomboc-ai/resource': 'aws_iam_role' } },
        { annotations: { 'gomboc-ai/resource': 'aws_s3_bucket' } },
      ] as unknown as Rule[];
      expect(PoliciesHandler.getResourceTypesFromRules(rules)).toBe(
        'aws_s3_bucket, aws_iam_role',
      );
    });

    it('returns empty string when no rules have resource annotations', () => {
      const rules = [{ annotations: {} }] as unknown as Rule[];
      expect(PoliciesHandler.getResourceTypesFromRules(rules)).toBe('');
    });

    it('returns empty string for empty array', () => {
      expect(PoliciesHandler.getResourceTypesFromRules([])).toBe('');
    });
  });

  describe('getRuleFrameworkData', () => {
    it('extracts framework shortName and name from classificationPaths', () => {
      const rules = [
        {
          classificationPaths: [
            [{ name: 'gomboc-ai/SOC2/control/cc6.1/some-rule' }],
          ],
        },
      ] as unknown as Rule[];
      const result = PoliciesHandler.getRuleFrameworkData(rules);
      expect(result).toEqual([
        { shortName: 'SOC2', name: 'gomboc-ai/SOC2/control/cc6.1/some-rule' },
      ]);
    });

    it('skips POLICY type entries', () => {
      const rules = [
        {
          classificationPaths: [[{ name: 'gomboc-ai/POLICY/some/path/rule' }]],
        },
      ] as unknown as Rule[];
      expect(PoliciesHandler.getRuleFrameworkData(rules)).toEqual([]);
    });

    it('handles rules without classificationPaths', () => {
      const rules = [{}] as unknown as Rule[];
      expect(PoliciesHandler.getRuleFrameworkData(rules)).toEqual([]);
    });

    it('skips classifications that do not have exactly 5 path segments', () => {
      const rules = [
        {
          classificationPaths: [[{ name: 'gomboc-ai/SOC2/cc6.1' }]],
        },
      ] as unknown as Rule[];
      expect(PoliciesHandler.getRuleFrameworkData(rules)).toEqual([]);
    });
  });
});

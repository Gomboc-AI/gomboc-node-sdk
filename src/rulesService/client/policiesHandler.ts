import { Policy, PolicyAnnotations, Rule } from './types';

/**
 * PoliciesHandler is the higher level business component that handles policy operations.
 * All of the functions will handle calling the sdk class, and will need to handle the neverthrow that that class
 * returns.
 */
export class PoliciesHandler {
  public policies: Policy[];
  public annotations: Array<{ value: string; key: string }>;

  private constructor(args: { policies: Policy[] }) {
    const { policies } = args;
    this.policies = policies;
    this.annotations = this.getUniqueAnnotations();
  }

  public static init(args: { policies: Policy[] }): PoliciesHandler {
    return new PoliciesHandler(args);
  }

  /**
   * Gets a list of all unique annotations from the loaded policies.
   * Returns an array of objects with `value` and `key` properties.
   */
  private getUniqueAnnotations = (): Array<{ value: string; key: string }> => {
    const annotationMap = new Map<string, Set<string>>();

    // Collect all annotation values grouped by their keys
    for (const policy of this.policies) {
      if (!policy.annotations) continue;

      for (const [key, rawValue] of Object.entries(policy.annotations)) {
        if (!rawValue) continue;

        // Handle string values (including newline-separated)
        if (typeof rawValue === 'string') {
          const values = PoliciesHandler.getAnnotationValueList(
            policy.annotations,
            key
          );
          if (!annotationMap.has(key)) {
            annotationMap.set(key, new Set());
          }
          values.forEach(value => annotationMap.get(key)!.add(value));
        }
      }
    }

    // Convert to array of { value, key } objects, deduplicated
    const result: Array<{ value: string; key: string }> = [];
    const seen = new Set<string>();
    for (const [key, values] of annotationMap.entries()) {
      for (const value of values) {
        const uniqueKey = `${key}:${value}`;
        if (!seen.has(uniqueKey)) {
          seen.add(uniqueKey);
          result.push({ value, key });
        }
      }
    }

    return result;
  };

  /**
   * Gets a list of unique annotation keys (types) from the loaded policies.
   */
  public getAnnotationTypes = (): string[] => {
    const keys = new Set<string>();
    this.annotations.forEach(annotation => {
      keys.add(annotation.key);
    });
    return Array.from(keys).sort();
  };

  /**
   * Gets annotations, optionally filtered by keys.
   * @param keys Optional array of keys to filter by. If not provided, returns all annotations.
   */
  public getAnnotations = (
    keys?: string[]
  ): Array<{ value: string; key: string }> => {
    if (!keys || keys.length === 0) {
      return this.annotations;
    }
    const keySet = new Set(keys);
    return this.annotations.filter(annotation => keySet.has(annotation.key));
  };

  /**
   * Filters policies by name and/or annotations.
   * @param nameSearchTerm Search term for policy name (case-insensitive contains search).
   *                       Returns all policies if empty or less than 2 characters.
   * @param annotations Optional list of annotations to filter by (key and value pairs).
   *                   A policy matches if it has any of the specified annotations.
   */
  public filter(
    nameSearchTerm: string,
    annotations?: Array<{ key: string; value: string }>
  ): Policy[] {
    let filtered = this.policies;

    // Filter by name if search term is provided
    if (nameSearchTerm && nameSearchTerm.trim().length >= 2) {
      const trimmedSearch = nameSearchTerm.trim().toLowerCase();
      filtered = filtered.filter(policy =>
        policy.name.toLowerCase().includes(trimmedSearch)
      );
    }

    // Filter by annotations if any are provided
    if (annotations && annotations.length > 0) {
      filtered = filtered.filter(policy => {
        if (!policy.annotations) return false;

        // Check if policy has any of the specified annotations
        return annotations.some(annotation => {
          const policyValue = policy.annotations?.[annotation.key];
          if (!policyValue || typeof policyValue !== 'string') return false;

          // Get the list of values for this key (handles newline-separated values)
          const values = PoliciesHandler.getAnnotationValueList(
            policy.annotations,
            annotation.key
          );
          return values.includes(annotation.value);
        });
      });
    }

    return filtered;
  }

  /** Some annotations contain arrays of values, which are stored as a single string with newlines. This function formats them into a comma separated list. */
  public static formatAnnotationValue = (
    value: string | undefined | null
  ): string => {
    if (!value || typeof value !== 'string') return '';
    return value
      .split('\n')
      .filter(item => item.trim())
      .join(', ');
  };

  /** Gets a single annotation value from a policy annotations object */
  public static getAnnotationValue = (
    annotations: PolicyAnnotations,
    key: string
  ): string => {
    if (!annotations) return '';
    const value = annotations[key as keyof typeof annotations];
    return this.formatAnnotationValue(
      typeof value === 'string' ? value : undefined
    );
  };

  /** This version of getAnnotation needed as some of the annotations are formatted with markdown and need to stay as is */
  public static getAnnotationValueNoReformat = (
    annotations: PolicyAnnotations,
    key: string
  ): string => {
    if (!annotations) return '';
    const value = annotations[key as keyof typeof annotations];
    return typeof value === 'string' ? value : '';
  };

  /** Gets an array of values from a policy annotations object */
  public static getAnnotationValueList = (
    annotations: PolicyAnnotations,
    key: string
  ): string[] => {
    if (!annotations) return [];
    const value = annotations[key as keyof typeof annotations];
    if (!value || typeof value !== 'string') return [];
    return value.split('\n').filter(item => item.trim());
  };

  /** Gets a comma separated list of resource types from a list of rules */
  public static getResourceTypesFromRules = (rules: Rule[]): string => {
    const resourceTypes = rules
      .map(rule => rule.annotations?.['gomboc-ai/resource'])
      .filter((resource): resource is string => typeof resource === 'string')
      .filter(Boolean);

    const uniqueResourceTypes = [...new Set(resourceTypes)];
    return uniqueResourceTypes.join(', ');
  };

  public static getPoliciesIac = (policies: Policy[]): string[] => {
    const allValues = policies.flatMap(policy =>
      this.getAnnotationValueList(policy.annotations, 'gomboc-ai/iac')
    );
    return [...new Set(allValues)];
  };

  public static getPoliciesProviders = (policies: Policy[]): string[] => {
    const allValues = policies.flatMap(policy =>
      this.getAnnotationValueList(policy.annotations, 'gomboc-ai/providers')
    );
    return [...new Set(allValues)];
  };

  public static getPoliciesCategories = (policies: Policy[]): string[] => {
    const allValues = policies.flatMap(policy =>
      this.getAnnotationValueList(policy.annotations, 'gomboc-ai/categories')
    );
    return [...new Set(allValues)];
  };

  public static getPoliciesImpactScore = (policies: Policy[]): string[] => {
    return policies.map(policy =>
      this.getAnnotationValue(policy.annotations, 'gomboc-ai/impact/score')
    );
  };

  /** Leading markdown heading some impact statements include before the body copy. */
  private static IMPACT_STATEMENT_HEADING_PREFIX = /^##\s*Impact\s*\n+/;

  public static getPoliciesImpactStatement = (
    policies: Policy[],
    options?: { clean?: boolean }
  ): string[] => {
    return policies.map(policy => {
      let raw = this.getAnnotationValueNoReformat(
        policy.annotations,
        'gomboc-ai/impact/statement'
      );
      if (options?.clean && raw) {
        raw = raw
          .replace(PoliciesHandler.IMPACT_STATEMENT_HEADING_PREFIX, '')
          .trim();
      }
      return raw;
    });
  };

  public static removeMarkdownFromDescription = (
    policies: Policy[]
  ): string => {
    const description = policies[0]?.description;
    if (typeof description !== 'string') return '';
    return description.replace(/^## Description\n\n/, '').trim();
  };

  public static getRuleFrameworkData = (
    rules: Rule[]
  ): Array<{ shortName: string; name: string }> => {
    const frameworks: Array<{ shortName: string; name: string }> = [];

    for (const rule of rules) {
      if (!rule.classificationPaths) continue;

      for (const pathArray of rule.classificationPaths) {
        for (const classPath of pathArray) {
          if (!classPath.name) continue;

          const parts = classPath.name.split('/');
          if (parts.length === 5) {
            const shortName = parts[1].toUpperCase();
            if (shortName === 'POLICY') continue;
            frameworks.push({
              shortName,
              name: classPath.name,
            });
          }
        }
      }
    }

    return frameworks;
  };
}

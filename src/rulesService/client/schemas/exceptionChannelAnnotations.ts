import { z } from 'zod';

/** Newline-separated strings from the API are normalized to a string array. */
function preprocessStringArrayAnnotation(value: unknown): unknown {
  if (typeof value === 'string') {
    return value
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }
  return value;
}

const gombocAiStringArrayAnnotationSchema = z.preprocess(
  preprocessStringArrayAnnotation,
  z.array(z.string()),
);

/** Stored on exception channels as `annotations['gomboc-ai/rules']`. */
export const gombocAiRulesAnnotationSchema = gombocAiStringArrayAnnotationSchema;

/** Stored on exception channels as `annotations['gomboc-ai/policy-sets']`. */
export const gombocAiPolicySetsAnnotationSchema =
  gombocAiStringArrayAnnotationSchema;

/**
 * Parses a rules-service annotation value: a JSON string array, or a single
 * string with entries separated by newlines (as stored on some channels).
 * @throws Error with Zod issues in the message when validation fails.
 */
export function parseGombocAiStringArrayAnnotation(
  value: unknown,
  fieldName: string,
): string[] {
  const result = gombocAiStringArrayAnnotationSchema.safeParse(value);
  if (!result.success) {
    const detail = result.error.issues
      .map(i => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid ${fieldName}: ${detail}`);
  }
  return result.data;
}

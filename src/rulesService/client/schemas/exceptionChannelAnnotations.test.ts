import {
  parseGombocAiBooleanAnnotation,
  parseGombocAiStringAnnotation,
  parseGombocAiStringArrayAnnotation,
} from './exceptionChannelAnnotations';

describe('parseGombocAiStringArrayAnnotation', () => {
  it('accepts string arrays', () => {
    expect(
      parseGombocAiStringArrayAnnotation(['a', 'b'], 'gomboc-ai/rules')
    ).toEqual(['a', 'b']);
  });

  it('accepts newline-separated string (rules-service style)', () => {
    expect(
      parseGombocAiStringArrayAnnotation(
        'CIS - Controls 8.1.2\nPrisma Cloud',
        'gomboc-ai/framework'
      )
    ).toEqual(['CIS - Controls 8.1.2', 'Prisma Cloud']);
  });

  it('accepts single-line string as one entry', () => {
    expect(
      parseGombocAiStringArrayAnnotation('only-one', 'gomboc-ai/rules')
    ).toEqual(['only-one']);
  });

  it('rejects non-array non-string values', () => {
    expect(() =>
      parseGombocAiStringArrayAnnotation(123, 'gomboc-ai/rules')
    ).toThrow(/Invalid gomboc-ai\/rules/);
  });

  it('rejects mixed-type arrays', () => {
    expect(() =>
      parseGombocAiStringArrayAnnotation(['ok', 1], 'gomboc-ai/rules')
    ).toThrow(/Invalid gomboc-ai\/rules/);
  });
});

describe('parseGombocAiStringAnnotation', () => {
  it('returns parsed string when valid', () => {
    expect(
      parseGombocAiStringAnnotation('Gomboc.AI', 'gomboc-ai/created-by')
    ).toBe('Gomboc.AI');
  });

  it('returns default value for nullish annotation', () => {
    expect(
      parseGombocAiStringAnnotation(undefined, 'gomboc-ai/created-by')
    ).toBe('');
  });

  it('rejects non-string values', () => {
    expect(() =>
      parseGombocAiStringAnnotation(123, 'gomboc-ai/created-by')
    ).toThrow(/Invalid gomboc-ai\/created-by/);
  });
});

describe('parseGombocAiBooleanAnnotation', () => {
  it('returns parsed boolean when valid', () => {
    expect(parseGombocAiBooleanAnnotation(true, 'gomboc-ai/is-default')).toBe(
      true
    );
  });

  it('returns default value for nullish annotation', () => {
    expect(
      parseGombocAiBooleanAnnotation(undefined, 'gomboc-ai/is-default')
    ).toBe(false);
  });

  it('rejects non-boolean values', () => {
    expect(() =>
      parseGombocAiBooleanAnnotation('true', 'gomboc-ai/is-default')
    ).toThrow(/Invalid gomboc-ai\/is-default/);
  });
});

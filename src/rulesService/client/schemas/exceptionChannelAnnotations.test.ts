import { parseGombocAiStringArrayAnnotation } from './exceptionChannelAnnotations';

describe('parseGombocAiStringArrayAnnotation', () => {
  it('accepts string arrays', () => {
    expect(
      parseGombocAiStringArrayAnnotation(['a', 'b'], 'gomboc-ai/rules'),
    ).toEqual(['a', 'b']);
  });

  it('accepts newline-separated string (rules-service style)', () => {
    expect(
      parseGombocAiStringArrayAnnotation(
        'CIS - Controls 8.1.2\nPrisma Cloud',
        'gomboc-ai/framework',
      ),
    ).toEqual(['CIS - Controls 8.1.2', 'Prisma Cloud']);
  });

  it('accepts single-line string as one entry', () => {
    expect(
      parseGombocAiStringArrayAnnotation('only-one', 'gomboc-ai/rules'),
    ).toEqual(['only-one']);
  });

  it('rejects non-array non-string values', () => {
    expect(() =>
      parseGombocAiStringArrayAnnotation(123, 'gomboc-ai/rules'),
    ).toThrow(/Invalid gomboc-ai\/rules/);
  });

  it('rejects mixed-type arrays', () => {
    expect(() =>
      parseGombocAiStringArrayAnnotation(['ok', 1], 'gomboc-ai/rules'),
    ).toThrow(/Invalid gomboc-ai\/rules/);
  });
});

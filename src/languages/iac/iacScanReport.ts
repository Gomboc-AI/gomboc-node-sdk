import { ScanReport } from '@/languages/types';
import { Report as OrlReport } from '@/orl/generated-types/report';

const stringifyError = (error: unknown): string => {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return String(error);
};

const escapeCell = (value: string): string => value.replace(/\|/g, '\\|');

const removeNewlines = (value: string): string => value.replace(/\n/g, ' ').trim();

const generateSummaryTable = (report: OrlReport): string => {
  // All the data is collected & sorted, now produce the markdown table
  let summaryTemplate = `| Severity | Risk | Target | Description | Fixes | File | Policy | Framework |
|--------------|--------|-------------|-------|---------------|--------|--------|-----------|
`;

  const rulesWithFixes = report.spec.rules.filter(rule => rule.fixes > 0);
  const tableRows = rulesWithFixes.map(rule => {
    const annotations = rule.metadata.annotations ?? {};
    const impactScore = annotations['gomboc-ai/impact/score'] ?? '—';
    const riskScore = annotations['gomboc-ai/risk/score'] ?? '—';
    const resource = annotations['gomboc-ai/resource'];
    const target = resource ? `\`${resource}\`` : 'Unknown';
    const description =
      annotations['gomboc-ai/description-plain'] ??
      annotations['ruleset-description'] ??
      rule.metadata.description ??
      rule.metadata.display_name ??
      rule.name;
    const policy = (rule.metadata.classifications ?? [])
      .filter(classification => classification.includes('policy'))
      .join(', ');
    const framework = (rule.metadata.classifications ?? [])
      .filter(classification => !classification.includes('policy'))
      .join(', ');
    const filePaths =
      rule.files.length > 0
        ? rule.files.map(file => `\`${file.path}\``).join(', ')
        : '';

    const cols = [
      escapeCell(impactScore),
      escapeCell(riskScore),
      target,
      escapeCell(removeNewlines(description)),
      String(rule.fixes),
      escapeCell(filePaths),
      escapeCell(policy),
      escapeCell(framework),
    ];

    return `| ${cols.join(' | ')} |`;
  });

  const tableSection = tableRows.join('\n') || '| No fixes applied | | | | | | |';

  const separatorIndex = summaryTemplate.indexOf('|--------------|');
  if (separatorIndex !== -1) {
    const separatorEnd = summaryTemplate.indexOf('\n', separatorIndex) + 1;
    summaryTemplate =
      summaryTemplate.slice(0, separatorEnd) +
      tableSection +
      '\n' +
      summaryTemplate.slice(separatorEnd);
  }

  return summaryTemplate;
};

export const makeIacScanReport = (report: OrlReport): ScanReport => {
  const reportName = report.metadata.display_name ?? report.metadata.name;
  const { language, rules, errors } = report.spec;

  const files = rules
    .filter(
      rule => rule.findings > 0 || rule.fixes > 0 || rule.files.length > 0
    )
    .map(rule => {
      const fileList =
        rule.files.length > 0
          ? rule.files.map(file => `\`${file.path}\``).join(', ')
          : 'No files listed';

      return {
        title: rule.metadata.display_name ?? rule.name,
        summary: `Findings: ${rule.findings} | Fixes: ${rule.fixes} | Files: ${fileList}`,
      };
    });

  const topLevelErrors = errors.map(stringifyError);
  const ruleErrors = rules.flatMap(rule => rule.errors.map(stringifyError));
  const allErrors = [...topLevelErrors, ...ruleErrors].filter(Boolean);

  const footer =
    allErrors.length === 0
      ? 'No errors encountered.'
      : `Errors (${allErrors.length}):\n${allErrors.map(error => `- ${error}`).join('\n')}`;

  const appliedRules = Array.from(
    new Set(
      rules
        .map(
          rule =>
            rule.metadata.annotations?.['ruleset-name'] ?? rule.metadata.name
        )
        .filter(Boolean)
    )
  );

  return {
    title: `${reportName} (${language})`,
    summary: generateSummaryTable(report),
    files,
    footer,
    appliedRules,
  };
};

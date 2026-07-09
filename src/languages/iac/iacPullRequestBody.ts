import {
  PullRequestBodyMaker,
  PullRequestBodyRulesServiceClient,
} from '../types';
import { Report as OrlReport } from '@/orl/generated-types/report';

/** Escape `|` so pipe characters do not split GFM table columns. */
const escapeMarkdownTableCellPipes = (s: string): string =>
  s.replace(/\|/g, '\\|');

const removeNewlines = (str: string): string => str.replace(/\n/g, ' ').trim();

/**
 * Description column follows the same precedence as structured formatter:
 * shortName + descriptionPlain, then shortName + rulesetDescription, then single field fallbacks.
 */
const formatDescriptionColumn = (args: {
  rulesetCaseName: string | null;
  rulesetDescription: string | null;
  descriptionPlain: string | null;
}): string | null => {
  const { rulesetCaseName, rulesetDescription, descriptionPlain } = args;
  const esc = escapeMarkdownTableCellPipes;

  if (rulesetCaseName && descriptionPlain) {
    return `**${esc(rulesetCaseName)}**<br>${esc(descriptionPlain)}`;
  }
  if (rulesetCaseName && rulesetDescription) {
    return `**${esc(rulesetCaseName)}**<br>${esc(rulesetDescription)}`;
  }
  if (rulesetCaseName) {
    return `**${esc(rulesetCaseName)}**`;
  }
  if (descriptionPlain) {
    return esc(descriptionPlain);
  }
  if (rulesetDescription) {
    return esc(rulesetDescription);
  }
  return null;
};

// takes a classification control, breaks it into its parts, and makes a markdown recursive list of its parts
const generateFrameworkDropdown = (args: {
  frameworkString: string;
}): string => {
  // gomboc-ai/cis/controls_8-1-2/11_data_recovery/11-2_perform_automated_backups
  const { frameworkString } = args;
  const parts = frameworkString.split('/').slice(1);

  if (parts.length === 0) return '';

  const formatPart = (part: string): string => {
    let formatted = part.toLowerCase();
    formatted = formatted.replace(/-/g, '.');
    formatted = formatted.replace(/_/g, ' ');
    return formatted;
  };

  if (parts.length === 1) {
    return `<details><summary>${formatPart(parts[0])}</summary></details>`;
  }

  const lastPart = parts[parts.length - 1];
  const content = formatPart(lastPart);
  const summaryParts = parts.slice(0, -1);

  let result = '';
  summaryParts.forEach(part => {
    result += `<details><summary>${formatPart(part)}</summary>`;
  });

  result += content;

  summaryParts.forEach(() => {
    result += '</details>';
  });

  return result;
};

// handles multiple framework classifications, grouping them by common parent paths
const generateFrameworkDropdowns = (args: {
  frameworkStrings: string[];
}): string => {
  const { frameworkStrings } = args;

  if (frameworkStrings.length === 0) return '';
  if (frameworkStrings.length === 1) {
    return generateFrameworkDropdown({ frameworkString: frameworkStrings[0] });
  }

  const formatPart = (part: string): string => {
    let formatted = part.toLowerCase();
    formatted = formatted.replace(/-/g, '.');
    formatted = formatted.replace(/_/g, ' ');
    return formatted;
  };

  const parseFramework = (frameworkString: string): string[] => {
    return frameworkString.split('/').slice(1);
  };

  const findCommonPath = (paths: string[][]): number => {
    if (paths.length === 0) return 0;
    if (paths.length === 1) return paths[0].length - 1;

    const minLength = Math.min(...paths.map(p => p.length));
    let commonDepth = 0;

    for (let i = 0; i < minLength - 1; i++) {
      const firstValue = paths[0][i];
      if (paths.every(p => p[i] === firstValue)) {
        commonDepth = i + 1;
      } else {
        break;
      }
    }

    return commonDepth;
  };

  const parsedPaths = frameworkStrings.map(parseFramework);
  const commonDepth = findCommonPath(parsedPaths);

  if (commonDepth === 0) {
    return frameworkStrings
      .map(fs => generateFrameworkDropdown({ frameworkString: fs }))
      .join('');
  }

  const commonPath = parsedPaths[0].slice(0, commonDepth);
  const remainingPaths = parsedPaths.map(path => path.slice(commonDepth));

  let result = '';
  commonPath.forEach(part => {
    result += `<details><summary>${formatPart(part)}</summary>`;
  });

  remainingPaths.forEach((remainingPath, index) => {
    if (remainingPath.length === 0) return;

    if (remainingPath.length === 1) {
      result += formatPart(remainingPath[0]);
    } else {
      const lastPart = remainingPath[remainingPath.length - 1];
      const summaryParts = remainingPath.slice(0, -1);

      summaryParts.forEach(part => {
        result += `<details><summary>${formatPart(part)}</summary>`;
      });

      result += formatPart(lastPart);

      summaryParts.forEach(() => {
        result += '</details>';
      });
    }

    if (index < remainingPaths.length - 1) {
      result += ' ';
    }
  });

  commonPath.forEach(() => {
    result += '</details>';
  });

  return result;
};

const generateErrorsSummary = (args: { report: OrlReport }): string => {
  const { report } = args;
  const allErrors: Array<{ resource: string; reason: string }> = [];

  report.spec.rules.forEach(rule => {
    const resource =
      rule.metadata.annotations?.['gomboc-ai/resource'] || 'Unknown';

    if (rule.errors && Array.isArray(rule.errors)) {
      rule.errors.forEach(error => {
        const objectMessage =
          typeof error === 'object' &&
          error !== null &&
          'message' in error &&
          typeof (error as { message?: unknown }).message === 'string'
            ? (error as { message: string }).message
            : null;
        const errorMessage =
          typeof error === 'string' ? error : objectMessage || String(error);
        const auditFindingIndex = errorMessage
          .toLowerCase()
          .indexOf('audit finding:');

        if (auditFindingIndex !== -1) {
          const reason = errorMessage
            .substring(auditFindingIndex + 'audit finding:'.length)
            .trim();
          allErrors.push({ resource, reason });
        }
      });
    }
  });

  if (allErrors.length === 0) {
    return '';
  }

  return allErrors
    .map(error => {
      return `- **Failure:** Failed to scan resource: \`${error.resource}\`
- **Error:** ${error.reason}`;
    })
    .join('\n>\n');
};

const generateStructuredSummary = async (args: {
  report: OrlReport;
  rulesServiceClient?: PullRequestBodyRulesServiceClient | null;
}): Promise<string> => {
  const { report, rulesServiceClient } = args;
  const rulesWithFixes = report.spec.rules.filter(rule => rule.fixes > 0);

  const numericScore = (score: string | null, nullValue: number) => {
    if (score == null) return nullValue;
    if (score === 'critical') return 4;
    if (score === 'high') return 3;
    if (score === 'medium') return 2;
    if (score === 'low') return 1;
    return nullValue;
  };

  let tableRowsData = await Promise.all(
    rulesWithFixes.map(async rule => {
      const ruleProp = (p: {
        key: string;
        transform?: (value: string) => string;
      }): string | null => {
        const { key, transform = (value: string) => value } = p;
        const raw = rule.metadata.annotations?.[key]?.trim();
        if (raw === undefined || raw === '') return null;
        return transform(raw);
      };

      const resourceType = ruleProp({ key: 'gomboc-ai/resource' });
      const rulesetDescription = ruleProp({
        key: 'ruleset-description',
        transform: removeNewlines,
      });
      const descriptionPlain = ruleProp({
        key: 'gomboc-ai/description-plain',
        transform: removeNewlines,
      });
      const impactScore = ruleProp({ key: 'gomboc-ai/impact/score' });
      const impactStatement = ruleProp({
        key: 'gomboc-ai/impact/statement-plain',
        transform: removeNewlines,
      });
      const riskScore = ruleProp({ key: 'gomboc-ai/risk/score' });
      const riskStatement = ruleProp({
        key: 'gomboc-ai/risk/statement-plain',
        transform: removeNewlines,
      });
      const ruleSetName = ruleProp({ key: 'ruleset-name' });

      const policyClassifications =
        rule.metadata.classifications &&
        Array.isArray(rule.metadata.classifications)
          ? rule.metadata.classifications.filter(classification =>
              classification.includes('policy')
            )
          : [];

      const frameworkClassifications =
        rule.metadata.classifications &&
        Array.isArray(rule.metadata.classifications)
          ? rule.metadata.classifications.filter(
              classification => !classification.includes('policy')
            )
          : [];

      const [rulesetCaseName, policyLinks] = await Promise.all([
        (async (): Promise<string | null> => {
          if (!ruleSetName || !rulesServiceClient) return null;
          try {
            const ruleResponse = await rulesServiceClient.getRule({
              name: ruleSetName,
            });
            const shortName = ruleResponse.shortName?.trim() ?? null;
            if (!shortName) return null;
            return removeNewlines(shortName);
          } catch {
            return null;
          }
        })(),
        Promise.all(
          policyClassifications.map(async classification => {
            if (!rulesServiceClient) return '';
            try {
              const classificationResponse =
                await rulesServiceClient.getClassification({
                  name: classification,
                });
              if (
                classificationResponse.annotations?.['gomboc-ai/type'] !==
                'policy'
              ) {
                return '';
              }
              const shortName = classificationResponse.shortName;
              const encodedPolicyName = encodeURIComponent(shortName ?? '');
              if (!shortName) return '';
              return `[${shortName}](POLICY_NAME:${encodedPolicyName})`;
            } catch {
              return '';
            }
          })
        ),
      ]);

      const description = formatDescriptionColumn({
        rulesetCaseName,
        rulesetDescription,
        descriptionPlain,
      });

      const validPolicyLinks = policyLinks.filter(link => link.length > 0);
      const policy =
        validPolicyLinks.length > 0 ? validPolicyLinks.join(', ') : '';

      let framework = '';
      if (frameworkClassifications.length > 0) {
        framework = generateFrameworkDropdowns({
          frameworkStrings: frameworkClassifications,
        });
      }

      return {
        impactScore,
        impactStatement,
        riskScore,
        riskStatement,
        resourceType,
        description,
        fixes: rule.fixes,
        files: rule.files,
        policy,
        framework,
        ruleSetName,
      };
    })
  );

  // Collapse rows that share the same ruleSetName (only when set)
  tableRowsData = (() => {
    const groups = new Map<string, (typeof tableRowsData)[number][]>();
    tableRowsData.forEach((row, i) => {
      const key = row.ruleSetName ?? `\0${i}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    });
    return Array.from(groups.values()).map(rows => {
      const allFiles = rows.flatMap(r => r.files);
      const seenPaths = new Set<string>();
      const files = allFiles.filter(f => {
        if (seenPaths.has(f.path)) return false;
        seenPaths.add(f.path);
        return true;
      });
      return {
        ...rows[0],
        fixes: rows.reduce((sum, r) => sum + r.fixes, 0),
        files,
      };
    });
  })();

  // Sort by Impact DESC and Risk ASC
  tableRowsData.sort((a, b) => {
    const impactScoreA = numericScore(a.impactScore, -1);
    const impactScoreB = numericScore(b.impactScore, -1);
    const riskScoreA = numericScore(a.riskScore, 5);
    const riskScoreB = numericScore(b.riskScore, 5);
    return impactScoreB - impactScoreA || riskScoreA - riskScoreB;
  });

  const toTableRow = (row: {
    impactScore: string | null;
    impactStatement: string | null;
    riskScore: string | null;
    riskStatement: string | null;
    resourceType: string | null;
    description: string | null;
    fixes: number;
    files: Array<{ path: string }>;
    policy: string;
    framework: string;
  }) => {
    const joinedFilePaths =
      row.files && row.files.length > 0
        ? row.files.map(file => `\`${file.path}\``).join(', ')
        : '';

    const cols = [
      `[${row.impactScore ?? '—'}](## "${row.impactStatement ?? ''}")`,
      `[${row.riskScore ?? '—'}](## "${row.riskStatement ?? ''}")`,
      row.resourceType ? `\`${row.resourceType}\`` : 'Unknown',
      row.description ?? 'Unknown',
      row.fixes,
      joinedFilePaths,
      row.policy,
      row.framework,
    ];
    return `| ${cols.join(' | ')} |`;
  };

  // All the data is collected & sorted, now produce the markdown table
  let summaryTemplate = `| Severity | Risk | Target | Description | Fixes | File | Policy | Framework |
|--------------|--------|-------------|-------|---------------|--------|--------|-----------|
`;

  const tableRows = tableRowsData.map(toTableRow);
  const tableSection =
    tableRows.join('\n') || '| No fixes applied | | | | | | |';

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

/** @deprecated Not needed anymore; handled by ORL itself. */
export const makeIacPullRequestBody: PullRequestBodyMaker = async args => {
  const {
    report,
    originalPullRequestIdentifier,
    originalPullRequestUrl,
    workspaceName,
    iacTool,
    fixes,
    maxLength = 30000,
    rulesServiceClient,
  } = args;

  const summary = await generateStructuredSummary({
    report,
    rulesServiceClient,
  });
  const footer = generateErrorsSummary({ report });
  const workspace = workspaceName ?? report.spec.workspace;
  const language = iacTool ?? report.spec.language;
  const totalFixes = fixes ?? report.spec.fixes;

  const originalPullReference =
    originalPullRequestIdentifier && originalPullRequestUrl
      ? `This fix was produced in response to [#${originalPullRequestIdentifier}](${originalPullRequestUrl}) on the following target:\n\n`
      : '';

  const l1 = workspace ? `- **Workspace**: ${workspace}\n\n` : '';
  const l2 = language ? `- **Language**: ${language}\n\n` : '';
  const l3 = totalFixes > 0 ? `- **Total Fixes**: ${totalFixes}\n\n` : '';
  const metadataSection = l1 || l2 || l3 ? `${l1}${l2}${l3}\n\n` : '';

  let markdown = `${originalPullReference}${metadataSection}${summary}

---

${footer}
`;

  if (markdown.length > maxLength) {
    const truncatedLength = maxLength - 200;
    markdown =
      markdown.substring(0, truncatedLength) +
      '\n\n...\n\n*Report truncated due to size limits*';
  }

  return markdown;
};

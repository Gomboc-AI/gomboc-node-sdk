import { Report as OrlReport } from '@/orl/generated-types/report';
import type { RulesServiceLoader } from '@/rulesService/client';

export type ScanReportFile = {
  title: String;
  summary: String;
};

export type ScanReport = {
  title: String;
  summary: String;
  files: ScanReportFile[];
  footer: String;
  appliedRules: String[];
};

export type ScanReportMaker = (report: OrlReport) => ScanReport;

export type PullRequestBodyRulesServiceClient = Pick<
  RulesServiceLoader,
  'getRule' | 'getClassification'
>;

export type PullRequestBodyArgs = {
  report: OrlReport;
  originalPullRequestIdentifier?: string | null;
  originalPullRequestUrl?: string | null;
  workspaceName?: string | null;
  iacTool?: string | null;
  fixes?: number;
  maxLength?: number;
  rulesServiceClient?: PullRequestBodyRulesServiceClient | null;
};

export type PullRequestBodyMaker = (
  args: PullRequestBodyArgs
) => Promise<string>;

export interface ILanguage {
  makeScanReport: ScanReportMaker;
  makePullRequestBody: PullRequestBodyMaker;
  // add more methods here as needed
}

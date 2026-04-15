import { makeIacPullRequestBody } from '../../iac/iacMarkdownReport';
import { makeIacScanReport } from '../../iac/iacScanReport';
import { ILanguage, PullRequestBodyArgs, ScanReport } from '../../types';
import { Report as OrlReport } from '../../../orl/generated-types/report';

export class Cloudformation implements ILanguage {
  makeScanReport(report: OrlReport): ScanReport {
    return makeIacScanReport(report);
  }

  makePullRequestBody(args: PullRequestBodyArgs): Promise<string> {
    return makeIacPullRequestBody(args);
  }
}

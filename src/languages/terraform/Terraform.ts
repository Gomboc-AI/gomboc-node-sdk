import { ILanguage, ScanReport } from '../types';

export class Terraform implements ILanguage {
  createScanReport(): ScanReport {
    return {
      title: 'Terraform Scan Report',
      summary: 'This is a summary of the Terraform scan report',
      files: [],
      footer: 'This is a footer of the Terraform scan report',
      appliedRules: [],
    };
  }
}

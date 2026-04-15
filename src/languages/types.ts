export interface ILanguage {
  createScanReport: (something: any) => ScanReport;
  // add more methods here as needed
}

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

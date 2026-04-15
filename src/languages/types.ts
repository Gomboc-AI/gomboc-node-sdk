export interface ILanguage {
  createScanReport: () => ScanReport
}


export type ScanReportFile = {
  title: String
  summary: String
}

export type ScanReport = {
  title: String
  summary: String
  files: ScanReportFile[]
  footer: String
  appliedRules: String[]
}
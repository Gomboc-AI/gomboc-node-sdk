/**
 * Public surface for language detection, handlers, diagnostics, fix-preview context,
 * IaC reporting helpers, and local storage utilities.
 */
export * from './types';
export * from './handlers';
export * from './selection/languageHandler';
export * from './diagnostics/languageDiagnosticOrchestrator';
export * from './fixPreview/languagePreviewContextOrchestrator';
export * from './fixPreview/previewResourceContextBuilder';
export * from './storage/fileSystemHandler';
export { makeIacScanReport } from './iac/iacScanReport';
export { makeIacPullRequestBody } from './iac/iacPullRequestBody';

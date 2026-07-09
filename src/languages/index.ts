/**
 * Public surface for language detection, handlers, diagnostics, fix-preview context,
 * IaC reporting helpers, and local storage utilities.
 *
 * @deprecated Not needed anymore; handled by ORL itself.
 */
export * from './types';
/** @deprecated Not needed anymore; handled by ORL itself. */
export * from './handlers';
/** @deprecated Not needed anymore; handled by ORL itself. */
export * from './selection/languageHandler';
/** @deprecated Not needed anymore; handled by ORL itself. */
export * from './diagnostics/languageDiagnosticOrchestrator';
/** @deprecated Not needed anymore; handled by ORL itself. */
export * from './fixPreview/languagePreviewContextOrchestrator';
/** @deprecated Not needed anymore; handled by ORL itself. */
export * from './fixPreview/previewResourceContextBuilder';
/** @deprecated Not needed anymore; handled by ORL itself. */
export * from './storage/fileSystemHandler';
/** @deprecated Not needed anymore; handled by ORL itself. */
export { makeIacScanReport } from './iac/iacScanReport';
/** @deprecated Not needed anymore; handled by ORL itself. */
export { makeIacPullRequestBody } from './iac/iacPullRequestBody';

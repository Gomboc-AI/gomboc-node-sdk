import { buildPreviewResourceContexts } from './previewResourceContextBuilder';
import {
  findMatchingLanguageImplementation,
  getResourceContextExtractKind,
} from '../selection/languageHandler';
import { PreviewContextHunk, PreviewResourceContext } from '../types';

/** @deprecated Not needed anymore; handled by ORL itself. */
export interface BuildLanguagePreviewResourceContextsArgs {
  filePath: string;
  content: string;
  hunks: PreviewContextHunk[];
  maxContexts?: number;
  maxLinesPerContext?: number;
}

/**
 * Coordinates language-specific preview context creation.
 *
 * @deprecated Not needed anymore; handled by ORL itself.
 */
export const buildLanguagePreviewResourceContexts = (
  args: BuildLanguagePreviewResourceContextsArgs
): PreviewResourceContext[] => {
  const handler = findMatchingLanguageImplementation({
    filePath: args.filePath,
    content: args.content,
  });
  if (!handler) {
    return buildPreviewResourceContexts({
      filePath: args.filePath,
      content: args.content,
      hunks: args.hunks,
      maxContexts: args.maxContexts,
      maxLinesPerContext: args.maxLinesPerContext,
      kind: getResourceContextExtractKind({
        filePath: args.filePath,
        content: args.content,
      }),
    });
  }

  return handler.buildPreviewResourceContexts({
    filePath: args.filePath,
    content: args.content,
    hunks: args.hunks,
    maxContexts: args.maxContexts,
    maxLinesPerContext: args.maxLinesPerContext,
  });
};

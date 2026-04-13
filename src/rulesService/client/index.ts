import type { ILogger } from '../ILogger';
import { RulesServiceLoader } from './rulesServiceLoader';

export type InitRulesServiceLoaderOptions = {
  accessToken: string;
  accountId: string;
  /** Rules service origin only (no `/api` suffix); the SDK adds `/api` and `/v1/...` paths. */
  baseUrl: string;
  kubernetesAuth?: string;
  logger: ILogger;
};

/**
 * Creates and returns a RulesServiceLoader.
 * Callers supply auth and service configuration (e.g. from their app session and env).
 */
export async function initRulesServiceLoader(
  options: InitRulesServiceLoaderOptions
): Promise<RulesServiceLoader> {
  const { accessToken, accountId, baseUrl, ...rest } = options;
  return RulesServiceLoader.init({
    accessToken,
    accountId,
    baseUrl,
    ...rest,
  });
}

export { PoliciesHandler } from './policiesHandler';
export { RulesServiceLoader } from './rulesServiceLoader';
export * from './queryUtils';
export * from './types';

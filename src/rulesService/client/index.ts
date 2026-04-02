import { LRUCache } from 'lru-cache';

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

const rulesServiceCache = new LRUCache<string, RulesServiceLoader>({
  max: 100,
});

function cacheKey(
  accessToken: string,
  accountId: string,
  baseUrl: string
): string {
  return `${accessToken}\0${accountId}\0${baseUrl}`;
}

/**
 * Returns a cached RulesServiceLoader for the same access token, account, and base URL, or creates one.
 * Callers supply auth and service configuration (e.g. from their app session and env).
 */
export async function initRulesServiceLoader(
  options: InitRulesServiceLoaderOptions
): Promise<RulesServiceLoader> {
  const { accessToken, accountId, baseUrl, ...rest } = options;
  const key = cacheKey(accessToken, accountId, baseUrl);
  if (rulesServiceCache.has(key)) {
    return rulesServiceCache.get(key) as RulesServiceLoader;
  }
  const client = await RulesServiceLoader.init({
    accessToken,
    accountId,
    baseUrl,
    ...rest,
  });
  rulesServiceCache.set(key, client);
  return client;
}

export { PoliciesHandler } from './policiesHandler';
export { RulesServiceLoader } from './rulesServiceLoader';
export * from './types';

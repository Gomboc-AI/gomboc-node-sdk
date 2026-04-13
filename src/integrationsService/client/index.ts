import type { ILogger } from '../../rulesService/ILogger';
import { IntegrationsServiceSdk, type AccountId } from '../sdk';

export type InitIntegrationsServiceSdkOptions = {
  accessToken: string;
  accountId: AccountId;
  /** Integrations service origin (for example: https://api.example.com). */
  baseUrl: string;
  logger: ILogger;
};

/** Creates a new IntegrationsServiceSdk instance. */
export async function initIntegrationsServiceSdk(
  options: InitIntegrationsServiceSdkOptions
): Promise<IntegrationsServiceSdk> {
  const { accessToken, accountId, baseUrl, ...rest } = options;
  return IntegrationsServiceSdk.init({
    accessToken,
    accountId,
    baseUrl,
    ...rest,
  });
}

export { IntegrationsServiceSdk } from '../sdk';
export type * from '../sdk';

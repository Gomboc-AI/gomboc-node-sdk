/* eslint-disable no-console -- integration logger uses console */
/**
 * Live HTTP checks (GET only) against the deployed rules service.
 *
 * CI is detected (`CI` / `GITHUB_ACTIONS`); this suite never runs there even if env vars are set.
 *
 * Optional: RULES_SDK_INTEGRATION_BASE_URL — origin only (no `/api`); the SDK appends `/api` and
 * paths such as `/v1/rules/get`.
 */

import dotenv from 'dotenv';
import type { ILogger } from '../ILogger';
import { RulesServiceSdk } from './v1Sdk';

dotenv.config();

jest.setTimeout(60_000);

/** Never run live HTTP tests in CI, even if secrets are misconfigured. */
const isCi = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

const integrationEnabled =
  !isCi &&
  process.env.RULES_SDK_INTEGRATION === '1' &&
  Boolean(process.env.RULES_SDK_INTEGRATION_TOKEN?.trim());

const accessToken = process.env.RULES_SDK_INTEGRATION_TOKEN?.trim() ?? '';

const integrationBaseUrl =
  process.env.RULES_SDK_INTEGRATION_BASE_URL?.trim() ||
  'https://rules.dev.gcp.gomboc.ai';

const integrationLogger: ILogger = {
  error: (message, ...args) => {
    console.error(message, ...args);
  },
  info: (message, ...args) => {
    console.info(message, ...args);
  },
  warn: (message, ...args) => {
    console.warn(message, ...args);
  },
  debug: (message, ...args) => {
    console.debug(message, ...args);
  },
};

function buildLiveSdk(): RulesServiceSdk {
  return RulesServiceSdk.init({
    accountId: '',
    accessToken,
    baseUrl: integrationBaseUrl,
    kubernetesAuth: '',
    logger: integrationLogger,
  });
}

const integrationDescribe =
  integrationEnabled && accessToken ? describe : describe.skip;

integrationDescribe('RulesServiceSdk integration (live GETs only)', () => {
  let sdk: RulesServiceSdk;

  beforeAll(() => {
    sdk = buildLiveSdk();
  });

  it('getRulesPage returns success', async () => {
    const result = await sdk.getRulesPage({ perPage: 3, page: 1 });
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(Array.isArray(result.value.rules)).toBe(true);
    expect(typeof result.value.total).toBe('number');
  });

  it('getClassifications returns success', async () => {
    const result = await sdk.getClassifications({ perPage: 3, page: 1 });
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(Array.isArray(result.value.classifications)).toBe(true);
    expect(typeof result.value.total).toBe('number');
  });

  it('searchForChannels returns success', async () => {
    const result = await sdk.searchForChannels({ perPage: 3, page: 1 });
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(Array.isArray(result.value.channels)).toBe(true);
    expect(typeof result.value.total).toBe('number');
  });

  it('getRule succeeds when a rule name is available from search', async () => {
    const page = await sdk.getRulesPage({ perPage: 1, page: 1 });
    expect(page.isOk()).toBe(true);
    if (page.isErr() || page.value.rules.length === 0) {
      return;
    }
    const rule = page.value.rules[0];
    if (rule === undefined || rule.name === '') {
      return;
    }
    const result = await sdk.getRule({ name: rule.name });
    expect(result.isOk()).toBe(true);
  });

  it('getClassification succeeds when a classification name is available', async () => {
    const page = await sdk.getClassifications({ perPage: 1, page: 1 });
    expect(page.isOk()).toBe(true);
    if (page.isErr() || page.value.classifications.length === 0) {
      return;
    }
    const row = page.value.classifications[0];
    if (row === undefined || row.name === '') {
      return;
    }
    const result = await sdk.getClassification({ name: row.name });
    expect(result.isOk()).toBe(true);
  });

  it('getChannel and getChannelRules succeed when a channel exists', async () => {
    const search = await sdk.searchForChannels({ perPage: 1, page: 1 });
    expect(search.isOk()).toBe(true);
    if (search.isErr() || search.value.channels.length === 0) {
      return;
    }
    const ch = search.value.channels[0];
    if (ch === undefined || ch.name === '') {
      return;
    }
    const channelName = ch.name;

    const channel = await sdk.getChannel({ name: channelName });
    expect(channel.isOk()).toBe(true);

    const rules = await sdk.getChannelRules({ name: channelName });
    expect(rules.isOk()).toBe(true);
    if (!rules.isOk()) {
      return;
    }
    expect(Array.isArray(rules.value.rules)).toBe(true);
  });

  it('getAllClassifications aggregates pages (GET only)', async () => {
    const result = await sdk.getAllClassifications({
      params: { perPage: 5, page: 1 },
    });
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(Array.isArray(result.value.classifications)).toBe(true);
    expect(result.value.classifications.length).toBeLessThanOrEqual(
      result.value.total
    );
  });

  it('getClassificationsBatch fetches by name (GET only)', async () => {
    const page = await sdk.getClassifications({ perPage: 2, page: 1 });
    expect(page.isOk()).toBe(true);
    if (page.isErr() || page.value.classifications.length === 0) {
      return;
    }
    const names = page.value.classifications
      .map(c => c.name)
      .filter((n): n is string => Boolean(n));
    const result = await sdk.getClassificationsBatch({ names });
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.length).toBe(names.length);
  });
});

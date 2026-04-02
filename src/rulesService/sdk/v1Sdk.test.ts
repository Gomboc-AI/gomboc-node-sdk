import axios, { type AxiosInstance } from 'axios';
import type { ILogger } from '../ILogger';
import {
  RulesServiceError,
  extractErrorCode,
  extractErrorInfo,
  extractErrorMessage,
} from './RulesServiceError';
import type {
  BatchUpsertChannelsRequestParams,
  BatchUpsertChannelsRequestResponse,
  Classification,
  CreateChannelRequestBody,
  CreateChannelResponse,
  DeleteChannelRequestParams,
  DeleteChannelRequestResponse,
  GetChannelParams,
  GetChannelResponse,
  GetChannelRulesParams,
  GetChannelRulesResponse,
  GetChannelsSearchRequestParams,
  GetChannelsSearchRequestResponse,
  GetClassificationParams,
  GetClassificationResponse,
  GetClassificationsParams,
  GetClassificationsResponse,
  GetRuleParams,
  GetRuleResponse,
  GetRulesPageParams,
  GetRulesPageResponse,
  UpdateChannelRequestBody,
  UpdateChannelResponse,
} from './types';
import { RulesServiceSdk } from './v1Sdk';

const ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const ENTITY_ID = '00000000-0000-4000-8000-000000000002';
const ENTITY_ID_2 = '00000000-0000-4000-8000-000000000003';

type ApiSuccessEnvelope<T> = { status: 'success'; data: T };

function mockAxiosEnvelope<T>(envelope: ApiSuccessEnvelope<T>): {
  data: ApiSuccessEnvelope<T>;
} {
  return { data: envelope };
}

function minimalRuleResponse(name: string): GetRuleResponse {
  return {
    accountId: ACCOUNT_ID,
    type: 'policy',
    version: '1.0.0',
    iacLanguage: 'terraform',
    name,
    shortName: null,
    revision: 1,
    revisions: [1],
    id: ENTITY_ID,
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
  };
}

const emptyRulesPageResponse: GetRulesPageResponse = {
  rules: [],
  total: 0,
  page: 1,
  perPage: 20,
};

const emptyClassificationsSearchResponse: GetClassificationsResponse = {
  classifications: [],
  total: 0,
  page: 1,
  perPage: 20,
};

function minimalClassificationResponse(
  name: string,
  id: string = ENTITY_ID
): GetClassificationResponse {
  return {
    accountId: ACCOUNT_ID,
    name,
    parent: null,
    shortName: null,
    description: null,
    id,
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
  };
}

type ClassificationRow = GetClassificationsResponse['classifications'][number];

function classificationSearchRow(name: string, id: string): ClassificationRow {
  return {
    accountId: ACCOUNT_ID,
    name,
    parent: null,
    shortName: null,
    description: null,
    id,
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
  };
}

function minimalChannelResponse(name: string): GetChannelResponse {
  return {
    accountId: ACCOUNT_ID,
    name,
    filters: [],
    id: ENTITY_ID,
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
  };
}

const emptyChannelRulesResponse: GetChannelRulesResponse = {
  rules: [],
  total: 0,
  page: 1,
  perPage: 20,
};

const emptyChannelsSearchResponse: GetChannelsSearchRequestResponse = {
  channels: [],
  total: 0,
  page: 1,
  perPage: 20,
};

function minimalCreateChannelResponse(name: string): CreateChannelResponse {
  return {
    accountId: ACCOUNT_ID,
    name,
    filters: [],
    id: ENTITY_ID,
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
  };
}

function minimalUpdateChannelResponse(name: string): UpdateChannelResponse {
  return {
    accountId: ACCOUNT_ID,
    name,
    filters: [],
    id: ENTITY_ID,
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
  };
}

const deleteChannelOk: DeleteChannelRequestResponse = { success: true };

const batchUpsertOk: BatchUpsertChannelsRequestResponse = {
  results: [],
};

function createLogger(): jest.Mocked<ILogger> {
  return {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
}

type AxiosClientMock = {
  get: jest.Mock;
  post: jest.Mock;
  put: jest.Mock;
  delete: jest.Mock;
};

type BuildSdkResult = {
  sdk: RulesServiceSdk;
  client: AxiosClientMock;
  logger: jest.Mocked<ILogger>;
};

function buildSdk(): BuildSdkResult {
  const client: AxiosClientMock = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  };
  jest
    .spyOn(axios, 'create')
    .mockReturnValue(client as unknown as AxiosInstance);
  const logger = createLogger();
  const sdk = RulesServiceSdk.init({
    accountId: 'acct-1',
    accessToken: 'token-123',
    baseUrl: 'https://rules.service.local',
    kubernetesAuth: 'k8s-auth',
    logger,
  });
  return { sdk, client, logger };
}

/** Shape axios `isAxiosError` accepts for tests (not a real AxiosError instance). */
function makeAxiosError(status = 503): {
  isAxiosError: true;
  message: string;
  response: {
    status: number;
    statusText: string;
    data: {
      status: 'error';
      error: { message: string; code: string };
    };
  };
} {
  return {
    isAxiosError: true,
    message: 'request failed',
    response: {
      status,
      statusText: 'Service Unavailable',
      data: {
        status: 'error',
        error: {
          message: 'rules service unavailable',
          code: 'SERVICE_UNAVAILABLE',
        },
      },
    },
  };
}

describe('RulesServiceSdk', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('initializes with static init', () => {
    const { sdk } = buildSdk();
    expect(sdk).toBeInstanceOf(RulesServiceSdk);
    expect(axios.create).toHaveBeenCalledWith({
      baseURL: 'https://rules.service.local/api',
      headers: {
        Authorization: 'Bearer token-123',
        'x-account-id': 'acct-1',
        'kubernetes-auth': 'k8s-auth',
      },
    });
  });

  it('getRule calls /v1/rules/get and returns ok', async () => {
    const { sdk, client } = buildSdk();
    const ruleName = 'gomboc-ai/rule-1';
    const params: GetRuleParams = { name: ruleName };
    client.get.mockResolvedValue(
      mockAxiosEnvelope({
        status: 'success',
        data: minimalRuleResponse(ruleName),
      })
    );

    const result = await sdk.getRule(params);

    expect(client.get).toHaveBeenCalledWith('/v1/rules/get', {
      params: { name: ruleName },
    });
    expect(result.isOk()).toBe(true);
  });

  it('getRule returns API error shape on axios failure (plain object, not RulesServiceError)', async () => {
    const { sdk, client, logger } = buildSdk();
    const params: GetRuleParams = { name: 'gomboc-ai/rule-1' };
    client.get.mockRejectedValue(makeAxiosError(500));

    const result = await sdk.getRule(params);

    expect(result.isErr()).toBe(true);
    const err = result._unsafeUnwrapErr();
    expect(err).toEqual(
      expect.objectContaining({
        message: 'rules service unavailable',
        code: 'SERVICE_UNAVAILABLE',
      })
    );
    expect(err).not.toBeInstanceOf(RulesServiceError);
    expect(logger.error).toHaveBeenCalled();
  });

  it('getRulesPage calls /v1/rules/search with params', async () => {
    const { sdk, client } = buildSdk();
    const params: GetRulesPageParams = { query: '(eq $.name "x")' };
    client.get.mockResolvedValue(
      mockAxiosEnvelope({ status: 'success', data: emptyRulesPageResponse })
    );

    await sdk.getRulesPage(params);

    expect(client.get).toHaveBeenCalledWith('/v1/rules/search', {
      params,
    });
  });

  it('getClassifications calls /v1/classifications/search with params', async () => {
    const { sdk, client } = buildSdk();
    const params: GetClassificationsParams = { query: '(eq $.name "x")' };
    client.get.mockResolvedValue(
      mockAxiosEnvelope({
        status: 'success',
        data: emptyClassificationsSearchResponse,
      })
    );

    await sdk.getClassifications(params);

    expect(client.get).toHaveBeenCalledWith('/v1/classifications/search', {
      params,
    });
  });

  it('getClassification calls /v1/classifications/get', async () => {
    const { sdk, client } = buildSdk();
    const params: GetClassificationParams = { name: 'framework-1' };
    client.get.mockResolvedValue(
      mockAxiosEnvelope({
        status: 'success',
        data: minimalClassificationResponse('framework-1'),
      })
    );

    await sdk.getClassification(params);

    expect(client.get).toHaveBeenCalledWith('/v1/classifications/get', {
      params,
    });
  });

  it('getAllClassifications paginates and concatenates all pages', async () => {
    const { sdk, client } = buildSdk();
    const listParams: GetClassificationsParams = {
      query: '(eq $.annotations["gomboc-ai/type"] "framework")',
    };
    client.get
      .mockResolvedValueOnce(
        mockAxiosEnvelope({
          status: 'success',
          data: {
            classifications: [classificationSearchRow('f1', ENTITY_ID)],
            page: 1,
            perPage: 100,
            total: 2,
          },
        })
      )
      .mockResolvedValueOnce(
        mockAxiosEnvelope({
          status: 'success',
          data: {
            classifications: [classificationSearchRow('f2', ENTITY_ID_2)],
            page: 2,
            perPage: 100,
            total: 2,
          },
        })
      );

    const result = await sdk.getAllClassifications({ params: listParams });

    expect(client.get).toHaveBeenNthCalledWith(
      1,
      '/v1/classifications/search',
      {
        params: {
          query: listParams.query,
          perPage: 100,
          page: 1,
        },
      }
    );
    expect(client.get).toHaveBeenNthCalledWith(
      2,
      '/v1/classifications/search',
      {
        params: {
          query: listParams.query,
          perPage: 100,
          page: 2,
        },
      }
    );
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().classifications).toEqual([
      classificationSearchRow('f1', ENTITY_ID),
      classificationSearchRow('f2', ENTITY_ID_2),
    ]);
  });

  it('getClassificationsBatch returns error when a getClassification fails', async () => {
    const { sdk, client } = buildSdk();
    client.get.mockRejectedValueOnce(makeAxiosError(500));

    const result = await sdk.getClassificationsBatch({
      names: ['gomboc-ai/policy-1'],
    });

    expect(result.isErr()).toBe(true);
  });

  it('getClassificationsBatch returns classifications when all succeed', async () => {
    const { sdk, client } = buildSdk();
    const policy: Classification =
      minimalClassificationResponse('gomboc-ai/policy-1');
    client.get.mockResolvedValue(
      mockAxiosEnvelope({ status: 'success', data: policy })
    );

    const result = await sdk.getClassificationsBatch({
      names: ['gomboc-ai/policy-1'],
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual([policy]);
  });

  it('getChannel calls /v1/channels/get', async () => {
    const { sdk, client } = buildSdk();
    const channelName = 'acct-1/set/default';
    const params: GetChannelParams = { name: channelName };
    client.get.mockResolvedValue(
      mockAxiosEnvelope({
        status: 'success',
        data: minimalChannelResponse(channelName),
      })
    );

    await sdk.getChannel(params);

    expect(client.get).toHaveBeenCalledWith('/v1/channels/get', {
      params,
    });
  });

  it('getChannelRules calls /v1/channels/rules', async () => {
    const { sdk, client } = buildSdk();
    const params: GetChannelRulesParams = { name: 'acct-1/set/default' };
    client.get.mockResolvedValue(
      mockAxiosEnvelope({
        status: 'success',
        data: emptyChannelRulesResponse,
      })
    );

    await sdk.getChannelRules(params);

    expect(client.get).toHaveBeenCalledWith('/v1/channels/rules', {
      params,
    });
  });

  it('searchForChannels calls /v1/channels/search', async () => {
    const { sdk, client } = buildSdk();
    const params: GetChannelsSearchRequestParams = {
      query: '(eq $.name "x")',
    };
    client.get.mockResolvedValue(
      mockAxiosEnvelope({
        status: 'success',
        data: emptyChannelsSearchResponse,
      })
    );

    await sdk.searchForChannels(params);

    expect(client.get).toHaveBeenCalledWith('/v1/channels/search', {
      params,
    });
  });

  it('createChannel posts to /v1/channels/create', async () => {
    const { sdk, client } = buildSdk();
    const body: CreateChannelRequestBody = {
      name: 'acct-1/set/new',
      query: '(or (contains "p1" finding.classification))',
      filters: [],
    };
    client.post.mockResolvedValue(
      mockAxiosEnvelope({
        status: 'success',
        data: minimalCreateChannelResponse(body.name),
      })
    );

    await sdk.createChannel(body);

    expect(client.post).toHaveBeenCalledWith('/v1/channels/create', body);
  });

  it('updateChannel puts to /v1/channels/update', async () => {
    const { sdk, client } = buildSdk();
    const body: UpdateChannelRequestBody = {
      name: 'acct-1/set/new',
      query: '(or (contains "p1" finding.classification))',
      filters: [],
    };
    client.put.mockResolvedValue(
      mockAxiosEnvelope({
        status: 'success',
        data: minimalUpdateChannelResponse(body.name),
      })
    );

    await sdk.updateChannel(body);

    expect(client.put).toHaveBeenCalledWith('/v1/channels/update', body);
  });

  it('deleteChannel sends delete params to /v1/channels/delete', async () => {
    const { sdk, client } = buildSdk();
    const params: DeleteChannelRequestParams = { name: 'acct-1/set/old' };
    client.delete.mockResolvedValue(
      mockAxiosEnvelope({ status: 'success', data: deleteChannelOk })
    );

    await sdk.deleteChannel(params);

    expect(client.delete).toHaveBeenCalledWith('/v1/channels/delete', {
      params,
    });
  });

  it('batchUpsertChannels posts to /v1/channels/batch/upsert', async () => {
    const { sdk, client } = buildSdk();
    const args: BatchUpsertChannelsRequestParams = {
      channels: [
        {
          name: 'acct-1/set/default',
          query: '(or (contains "p1" finding.classification))',
        },
      ],
    };
    client.post.mockResolvedValue(
      mockAxiosEnvelope({ status: 'success', data: batchUpsertOk })
    );

    await sdk.batchUpsertChannels(args);

    expect(client.post).toHaveBeenCalledWith('/v1/channels/batch/upsert', args);
  });
});

describe('RulesServiceError', () => {
  it('sets name, message, code, and statusCode', () => {
    const e = new RulesServiceError('boom', 'E_CODE', 502);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('RulesServiceError');
    expect(e.message).toBe('boom');
    expect(e.code).toBe('E_CODE');
    expect(e.statusCode).toBe(502);
  });
});

describe('extractErrorMessage / extractErrorCode / extractErrorInfo', () => {
  it('reads message and code from rules-service error body on axios errors', () => {
    const e = makeAxiosError(503);
    expect(extractErrorMessage(e)).toBe('rules service unavailable');
    expect(extractErrorCode(e)).toBe('SERVICE_UNAVAILABLE');
    expect(extractErrorInfo(e)).toEqual({
      message: 'rules service unavailable',
      code: 'SERVICE_UNAVAILABLE',
      statusCode: 503,
    });
  });

  it('extractErrorMessage falls back for axios errors without API envelope', () => {
    const e = {
      isAxiosError: true as const,
      message: 'network',
      response: { status: 404, statusText: 'Not Found', data: {} },
    };
    expect(extractErrorMessage(e)).toBe('Not Found');
    expect(extractErrorCode(e)).toBeUndefined();
  });

  it('extractErrorMessage handles generic Error and unknown', () => {
    expect(extractErrorMessage(new Error('plain'))).toBe('plain');
    expect(extractErrorMessage(null)).toBe('An unknown error occurred');
  });
});

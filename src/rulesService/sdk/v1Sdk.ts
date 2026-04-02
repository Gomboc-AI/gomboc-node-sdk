import axios, { type AxiosInstance } from 'axios';
import { err, ok, type Result } from 'neverthrow';
import type { ILogger } from '../ILogger';
import type {
  IRulesServiceSdk,
  IRulesServiceErrorType,
  GetRuleParams,
  GetRuleResponse,
  GetRulesPageParams,
  GetRulesPageResponse,
  GetClassificationParams,
  GetClassificationResponse,
  GetClassificationsParams,
  GetClassificationsResponse,
  Classification,
  GetChannelParams,
  GetChannelResponse,
  GetChannelsSearchRequestParams,
  GetChannelsSearchRequestResponse,
  GetChannelRulesParams,
  GetChannelRulesResponse,
  CreateChannelRequestBody,
  CreateChannelResponse,
  UpdateChannelRequestBody,
  UpdateChannelResponse,
  DeleteChannelRequestParams,
  DeleteChannelRequestResponse,
  BatchUpsertChannelsRequestParams,
  BatchUpsertChannelsRequestResponse,
} from './types';

type ApiSuccess<T> = { status: 'success'; data: T };
type ApiError = { status: 'error'; error: IRulesServiceErrorType };

/**
 * This class implementation should only be used to directly talk to the rules service,
 * and should not contain any business logic
 *
 * kubernetes-auth is going to be either
 * - frontegg
 * - kubernetes
 */
export class RulesServiceSdk implements IRulesServiceSdk {
  private client: AxiosInstance;
  private logger: ILogger;

  private constructor(args: {
    accountId: string;
    accessToken: string;
    baseUrl: string;
    kubernetesAuth: string;
    logger: ILogger;
  }) {
    const { accountId, accessToken, kubernetesAuth, baseUrl, logger } = args;
    this.logger = logger;
    this.client = axios.create({
      baseURL: `${baseUrl}/api`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'x-account-id': accountId,
        'kubernetes-auth': kubernetesAuth,
      },
    });
  }

  static init(args: {
    accountId: string;
    accessToken: string;
    baseUrl: string;
    kubernetesAuth: string;
    logger: ILogger;
  }): RulesServiceSdk {
    return new RulesServiceSdk(args);
  }

  private async request<T>(
    fn: () => Promise<ApiSuccess<T> | ApiError>
  ): Promise<Result<T, IRulesServiceErrorType>> {
    try {
      const body = await fn();
      if (body.status === 'success') return ok(body.data);
      return err(body.error);
    } catch (e) {
      const errBody =
        axios.isAxiosError(e) && e.response?.data
          ? (e.response.data as ApiError)
          : null;
      const error: IRulesServiceErrorType = errBody?.error ?? {
        message: e instanceof Error ? e.message : 'Unknown error',
      };
      this.logger.error('RulesServiceSdk request failed', error);
      return err(error);
    }
  }

  async getRule(
    args: GetRuleParams
  ): Promise<Result<GetRuleResponse, IRulesServiceErrorType>> {
    return this.request<GetRuleResponse>(async () => {
      const res = await this.client.get('/v1/rules/get', { params: args });
      return res.data;
    });
  }

  async getRulesPage(
    args?: GetRulesPageParams
  ): Promise<Result<GetRulesPageResponse, IRulesServiceErrorType>> {
    return this.request<GetRulesPageResponse>(async () => {
      const res = await this.client.get('/v1/rules/search', { params: args });
      return res.data;
    });
  }

  async getClassification(
    args: GetClassificationParams
  ): Promise<Result<GetClassificationResponse, IRulesServiceErrorType>> {
    return this.request<GetClassificationResponse>(async () => {
      const res = await this.client.get('/v1/classifications/get', {
        params: args,
      });
      return res.data;
    });
  }

  async getClassifications(
    args?: GetClassificationsParams
  ): Promise<Result<GetClassificationsResponse, IRulesServiceErrorType>> {
    return this.request<GetClassificationsResponse>(async () => {
      const res = await this.client.get('/v1/classifications/search', {
        params: args,
      });
      return res.data;
    });
  }

  async getAllClassifications(args: {
    params: GetClassificationsParams;
  }): Promise<Result<GetClassificationsResponse, IRulesServiceErrorType>> {
    const all: GetClassificationsResponse['classifications'] = [];
    let page = 1;
    const perPage = 100;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const result = await this.getClassifications({
        ...args.params,
        page,
        perPage,
      });
      if (result.isErr()) return result;
      const { classifications, total } = result.value;
      all.push(...classifications);
      if (all.length >= total) break;
      page += 1;
    }
    return ok({ classifications: all, total: all.length, page: 1, perPage });
  }

  async getClassificationsBatch(args: {
    names: string[];
  }): Promise<Result<Classification[], IRulesServiceErrorType>> {
    const results: Classification[] = [];
    for (const name of args.names) {
      const result = await this.getClassification({ name });
      if (result.isErr()) return err(result.error);
      results.push(result.value);
    }
    return ok(results);
  }

  async getChannel(
    args: GetChannelParams
  ): Promise<Result<GetChannelResponse, IRulesServiceErrorType>> {
    return this.request<GetChannelResponse>(async () => {
      const res = await this.client.get('/v1/channels/get', { params: args });
      return res.data;
    });
  }

  async searchForChannels(
    args: GetChannelsSearchRequestParams
  ): Promise<Result<GetChannelsSearchRequestResponse, IRulesServiceErrorType>> {
    return this.request<GetChannelsSearchRequestResponse>(async () => {
      const res = await this.client.get('/v1/channels/search', {
        params: args,
      });
      return res.data;
    });
  }

  async getChannelRules(
    args: GetChannelRulesParams
  ): Promise<Result<GetChannelRulesResponse, IRulesServiceErrorType>> {
    return this.request<GetChannelRulesResponse>(async () => {
      const res = await this.client.get('/v1/channels/rules', { params: args });
      return res.data;
    });
  }

  async createChannel(
    args: CreateChannelRequestBody
  ): Promise<Result<CreateChannelResponse, IRulesServiceErrorType>> {
    return this.request<CreateChannelResponse>(async () => {
      const res = await this.client.post('/v1/channels/create', args);
      return res.data;
    });
  }

  async updateChannel(
    args: UpdateChannelRequestBody
  ): Promise<Result<UpdateChannelResponse, IRulesServiceErrorType>> {
    return this.request<UpdateChannelResponse>(async () => {
      const res = await this.client.put('/v1/channels/update', args);
      return res.data;
    });
  }

  async deleteChannel(
    args: DeleteChannelRequestParams
  ): Promise<Result<DeleteChannelRequestResponse, IRulesServiceErrorType>> {
    return this.request<DeleteChannelRequestResponse>(async () => {
      const res = await this.client.delete('/v1/channels/delete', {
        params: args,
      });
      return res.data;
    });
  }

  async batchUpsertChannels(
    args: BatchUpsertChannelsRequestParams
  ): Promise<
    Result<BatchUpsertChannelsRequestResponse, IRulesServiceErrorType>
  > {
    return this.request<BatchUpsertChannelsRequestResponse>(async () => {
      const res = await this.client.post('/v1/channels/batch/upsert', args);
      return res.data;
    });
  }
}

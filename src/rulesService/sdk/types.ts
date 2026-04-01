import type { Result } from 'neverthrow';
import type {
  components,
  operations,
} from '../../__generated__/rulesService.js';

type Schemas = components['schemas'];

export type IRulesServiceErrorType =
  Schemas['GetApiV1RulesGetNegativeResponse']['error'];

export type GetRuleParams =
  operations['GetApiV1RulesGet']['parameters']['query'];
export type GetRuleResponse =
  Schemas['GetApiV1RulesGetPositiveResponse']['data'];

export type GetRulesPageParams =
  operations['GetApiV1RulesSearch']['parameters']['query'];
export type GetRulesPageResponse =
  Schemas['GetApiV1RulesSearchPositiveResponse']['data'];

export type GetClassificationParams =
  operations['GetApiV1ClassificationsGet']['parameters']['query'];
export type GetClassificationResponse =
  Schemas['GetApiV1ClassificationsGetPositiveResponse']['data'];

export type GetClassificationsParams =
  operations['GetApiV1ClassificationsSearch']['parameters']['query'];
export type GetClassificationsResponse =
  Schemas['GetApiV1ClassificationsSearchPositiveResponse']['data'];

export type Classification =
  Schemas['GetApiV1ClassificationsGetPositiveResponse']['data'];

export type GetChannelParams =
  operations['GetApiV1ChannelsGet']['parameters']['query'];
export type GetChannelResponse =
  Schemas['GetApiV1ChannelsGetPositiveResponse']['data'];

export type GetChannelsSearchRequestParams =
  operations['GetApiV1ChannelsSearch']['parameters']['query'];
export type GetChannelsSearchRequestResponse =
  Schemas['GetApiV1ChannelsSearchPositiveResponse']['data'];

export type GetChannelRulesParams =
  operations['GetApiV1ChannelsRules']['parameters']['query'];
export type GetChannelRulesResponse =
  Schemas['GetApiV1ChannelsRulesPositiveResponse']['data'];

export type CreateChannelRequestBody =
  Schemas['PostApiV1ChannelsCreateRequestBody'];
export type CreateChannelResponse =
  Schemas['PostApiV1ChannelsCreatePositiveResponse']['data'];

export type UpdateChannelRequestBody =
  Schemas['PutApiV1ChannelsUpdateRequestBody'];
export type UpdateChannelResponse =
  Schemas['PutApiV1ChannelsUpdatePositiveResponse']['data'];

export type DeleteChannelRequestParams =
  operations['DeleteApiV1ChannelsDelete']['parameters']['query'];
export type DeleteChannelRequestResponse =
  Schemas['DeleteApiV1ChannelsDeletePositiveResponse']['data'];

export type BatchUpsertChannelsRequestParams =
  Schemas['PostApiV1ChannelsBatchUpsertRequestBody'];
export type BatchUpsertChannelsRequestResponse =
  Schemas['PostApiV1ChannelsBatchUpsertPositiveResponse']['data'];

export interface IRulesServiceSdk {
  getRule(
    args: GetRuleParams
  ): Promise<Result<GetRuleResponse, IRulesServiceErrorType>>;
  getRulesPage(
    args?: GetRulesPageParams
  ): Promise<Result<GetRulesPageResponse, IRulesServiceErrorType>>;
  getClassification(
    args: GetClassificationParams
  ): Promise<Result<GetClassificationResponse, IRulesServiceErrorType>>;
  getClassifications(
    args?: GetClassificationsParams
  ): Promise<Result<GetClassificationsResponse, IRulesServiceErrorType>>;
  getAllClassifications(args: {
    params: GetClassificationsParams;
  }): Promise<Result<GetClassificationsResponse, IRulesServiceErrorType>>;
  getClassificationsBatch(args: {
    names: string[];
  }): Promise<Result<Classification[], IRulesServiceErrorType>>;
  getChannel(
    args: GetChannelParams
  ): Promise<Result<GetChannelResponse, IRulesServiceErrorType>>;
  searchForChannels(
    args: GetChannelsSearchRequestParams
  ): Promise<Result<GetChannelsSearchRequestResponse, IRulesServiceErrorType>>;
  getChannelRules(
    args: GetChannelRulesParams
  ): Promise<Result<GetChannelRulesResponse, IRulesServiceErrorType>>;
  createChannel(
    args: CreateChannelRequestBody
  ): Promise<Result<CreateChannelResponse, IRulesServiceErrorType>>;
  updateChannel(
    args: UpdateChannelRequestBody
  ): Promise<Result<UpdateChannelResponse, IRulesServiceErrorType>>;
  deleteChannel(
    args: DeleteChannelRequestParams
  ): Promise<Result<DeleteChannelRequestResponse, IRulesServiceErrorType>>;
  batchUpsertChannels(
    args: BatchUpsertChannelsRequestParams
  ): Promise<
    Result<BatchUpsertChannelsRequestResponse, IRulesServiceErrorType>
  >;
}

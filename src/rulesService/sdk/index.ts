export {
  buildOrNameQuery,
  buildSearchParamsWithDeprecatedOption,
  DEPRECATED_FILTER,
  ensureDeprecatedFilterOnQuery,
  mergeSearchQueryWithDeprecatedFilter,
  omitIncludeDeprecated,
} from './mergeSearchQueryWithDeprecatedFilter';
export type { WithIncludeDeprecated } from './mergeSearchQueryWithDeprecatedFilter';
export { RulesServiceSdk } from './v1Sdk';
export { RulesServiceError, extractErrorInfo } from './RulesServiceError';
export type {
  GetRuleParams,
  GetRuleResponse,
  GetRulesPageParams,
  GetRulesPageResponse,
  CreateChannelRequestBody,
  CreateChannelResponse,
  UpdateChannelRequestBody,
  UpdateChannelResponse,
} from './types';
export const ALL_POLICIES_CHANNEL_NAME = 'gomboc-ai/all-policies'; // this is hardcoded as its always going to be the same
export const DEFAULT_CHANNEL_NAME = 'gomboc-ai/v0-default'; // hardcoded default TURNED ON policies

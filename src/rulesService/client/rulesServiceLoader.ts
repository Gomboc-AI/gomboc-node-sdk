import {
  ALL_POLICIES_CHANNEL_NAME,
  extractErrorInfo,
  mergeSearchQueryWithDeprecatedFilter,
  RulesServiceError,
  RulesServiceSdk,
  ensureDeprecatedFilterOnQuery,
} from '../sdk';
import {
  BatchUpsertChannelsRequestParams,
  BatchUpsertChannelsRequestResponse,
  Channel,
  Classification,
  IRulesServiceSdk,
} from '../sdk/types';
import {
  CreateExceptionArgs,
  CreateExceptionSagaContext,
  CreatePolicySetArgs,
  DeleteExceptionArgs,
  DeleteExceptionSagaContext,
  Exception,
  ExceptionPage,
  Policy,
  PolicySet,
  PolicySetPage,
  Rule,
  SagaRollbackError,
  UpdatePolicySetArgs,
} from './types';
import {
  createSagaEventLogger,
  runSaga,
  SagaExecutionError,
  toSagaAccessLogger,
  type SagaCompensationFailure,
  type SagaStep,
} from '../../sagaAccessService';
import type { ILogger } from '../ILogger';
import { parseGombocAiStringArrayAnnotation } from './schemas/exceptionChannelAnnotations';

type BatchUpsertChannelResult =
  BatchUpsertChannelsRequestResponse['results'][number];

/**
 * Rules service is the higher level business component that will connect to the rules sdk.
 * All of the functions will handle calling the sdk class, and will need to handle the neverthrow that that class
 * returns.
 */

export class RulesServiceLoader {
  private client: IRulesServiceSdk;
  private accountId: string;
  private logger: ILogger;
  private static readonly POLICY_QUERY_SUBSTRING =
    /\(contains\s+"([^"]+)"\s+\$\.classification\)/g;

  /** Matches policy name in (contains "name" finding.classification) for getPolicySetPolicies */
  private static readonly POLICY_SET_POLICY_NAME_REGEX =
    /.*?\(contains\s+"([^"]+)"\s+finding\.classification\).*?/g;

  public allPolicies: Policy[];
  public accountPolicies: Policy[];

  private constructor(args: {
    accountId: string;
    accessToken: string;
    baseUrl: string;
    kubernetesAuth?: string;
    logger: ILogger;
  }) {
    const {
      accountId,
      accessToken,
      baseUrl,
      kubernetesAuth = '',
      logger,
    } = args;

    this.logger = logger;
    this.accountId = accountId;
    this.allPolicies = [];
    this.accountPolicies = [];

    this.logger.info('RulesService.init: Using rules service HTTP client');
    this.client = RulesServiceSdk.init({
      accountId,
      accessToken,
      baseUrl,
      kubernetesAuth,
      logger,
    });
  }

  private getAccountGlobalChannelName() {
    return `${this.accountId}/accounts/global`;
  }
  private getDefaultChannelName() {
    return `${this.accountId}/set/default`;
  }

  /** Query string that references the global channel (for use in workspace channel queries). */
  private getGlobalChannelQuery(): string {
    return `(channel "${this.getAccountGlobalChannelName()}" true)`;
  }

  /** Query string that references the default channel (used as the global channel's content). */
  private getDefaultChannelQuery(): string {
    return `(channel "${this.getDefaultChannelName()}" true)`;
  }

  private isQueryEmpty(queryString: string): boolean {
    const trimmed = queryString.trim();
    const orPrefix = /^\s*\(\s*or\s*/i;
    const andOrPrefix = /^\s*\(\s*and\s*\(\s*or\s*/i;

    let openParenIndex: number;
    if (andOrPrefix.test(trimmed)) {
      // (and (or ...)) — find the inner (or's opening paren (second "(")
      const firstParen = trimmed.indexOf('(');
      openParenIndex = trimmed.indexOf('(', firstParen + 1);
    } else if (orPrefix.test(trimmed)) {
      // (or ...)
      openParenIndex = trimmed.indexOf('(');
    } else {
      return false;
    }

    if (openParenIndex === -1) return false;
    let depth = 0;
    for (let i = openParenIndex; i < trimmed.length; i++) {
      const c = trimmed[i];
      if (c === '(') depth++;
      else if (c === ')') {
        depth--;
        if (depth === 0) {
          const inner = trimmed.substring(openParenIndex + 1, i);
          return !/[()]/.test(inner);
        }
      }
    }
    return false;
  }

  private getPolicySetChannelName(policySetName: string) {
    return `${this.accountId}/set/${policySetName}`;
  }

  private getWorkspaceChannelsName(workspaceId: string) {
    return `${this.accountId}/wksp/${workspaceId}`;
  }

  private getCreatedByAnnotation(channel: Channel) {
    if (channel.annotations && channel.annotations['gomboc-ai/created-by']) {
      return String(channel.annotations['gomboc-ai/created-by']);
    }
  }
  private getDescriptionAnnotation(channel: Channel) {
    if (channel.annotations && channel.annotations['gomboc-ai/description']) {
      return String(channel.annotations['gomboc-ai/description']);
    }
  }
  private getIsDefault(channel: Channel) {
    if (channel.annotations && channel.annotations['gomboc-ai/is-default']) {
      return Boolean(channel.annotations['gomboc-ai/is-default']);
    }
  }
  private getUpdatedBy(channel: Channel) {
    if (channel.annotations && channel.annotations['gomboc-ai/updated-by']) {
      return String(channel.annotations['gomboc-ai/updated-by']);
    }
  }
  private getShouldApplyToAllWorkspaces(channel: Channel) {
    if (channel.annotations) {
      return Boolean(channel.annotations['gomboc-ai/apply-to-all-workspaces']);
    }
  }
  private getPolicySetNameFromChannelName(channelName: string): string {
    const prefix = `${this.accountId}/set/`;
    if (channelName.startsWith(prefix)) {
      return channelName.substring(prefix.length);
    }
    return channelName;
  }

  private getExceptionChannelName(exceptionName: string) {
    return `${this.accountId}/exception/${exceptionName}`;
  }

  private getExceptionNameFromChannelName(channelName: string): string {
    const prefix = `${this.accountId}/exception/`;
    if (channelName.startsWith(prefix)) {
      return channelName.substring(prefix.length);
    }
    return channelName;
  }

  /**
   * Parses rule names from the exception channel `query` shape produced by
   * {@link createException}. Used when `annotations.rules` is absent (older channels).
   */
  private parseExceptionRuleNamesFromQuery(query: string): string[] {
    if (!query.trim()) {
      return [];
    }
    const names: string[] = [];
    const re = /\(eq \$\.name "([^"]*)"\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(query)) !== null) {
      names.push(m[1]);
    }
    return names;
  }

  /** Maps a rules-service exception channel to the API shape (short name, string dates). */
  private channelToException(channel: Channel): Exception {
    const a = channel.annotations;
    const description = this.getDescriptionAnnotation(channel);
    const rawPolicySets = a?.['gomboc-ai/policy-sets'];
    const policySets =
      rawPolicySets != null
        ? parseGombocAiStringArrayAnnotation(
            rawPolicySets,
            'gomboc-ai/policy-sets'
          )
        : [];
    const rawRules = a?.['gomboc-ai/rules'];
    const rules =
      rawRules != null
        ? parseGombocAiStringArrayAnnotation(rawRules, 'gomboc-ai/rules')
        : this.parseExceptionRuleNamesFromQuery(channel.query ?? '');
    const createdBy = this.getCreatedByAnnotation(channel) ?? '';

    return {
      // ...channel, // dont want to pass annotation
      id: channel.id,
      accountId: channel.accountId,
      filters: channel.filters,
      name: this.getExceptionNameFromChannelName(channel.name),
      rules,
      createdBy,
      ...(description && { description }),
      policySets: policySets.map(set =>
        this.getPolicySetNameFromChannelName(set)
      ),
      createdAt: String(channel.createdAt),
      updatedAt: String(channel.updatedAt),
    };
  }

  private getWorkspaceIdFromWorkspaceChannelName(channelName: string): string {
    const prefix = `${this.accountId}/wksp/`;
    if (channelName.startsWith(prefix)) {
      return channelName.substring(prefix.length);
    }
    return channelName;
  }

  static async init(args: {
    accessToken: string;
    accountId: string;
    baseUrl: string;
    kubernetesAuth?: string;
    logger: ILogger;
  }): Promise<RulesServiceLoader> {
    const instance = new RulesServiceLoader(args);
    await instance.initializePolicySets();
    return instance;
  }

  /** Loads all policies from the all policies channel
   * If fails, we'll let the error propagate
   */
  public async loadAllPolicies() {
    this.logger.info('RulesService.loadAllPolicies: Loading all policies');
    const allPolicies = await this.getChannelPolicies({
      channelName: ALL_POLICIES_CHANNEL_NAME,
    });
    this.allPolicies = allPolicies;
    this.logger.info('RulesService.loadAllPolicies: Success', {
      allPoliciesCount: this.allPolicies.length,
    });
  }

  public async loadAllAvailablePolicies() {
    this.logger.info(
      'RulesService.loadAllAvailablePolicies: Loading all available policies'
    );
    const result = await this.client.getAllClassifications({
      params: {
        query: mergeSearchQueryWithDeprecatedFilter(
          '(eq $.annotations["gomboc-ai/type"] "policy")',
          false
        ),
      },
    });

    if (result.isErr()) {
      this.logger.error('RulesService.loadAllAvailablePolicies failed', {
        error: result.error,
      });
      throw result.error;
    }

    this.allPolicies = result.value.classifications.map((c: Classification) =>
      this.classificationToPolicy(c)
    );
    this.logger.info('RulesService.loadAllAvailablePolicies: Success', {
      allPoliciesCount: this.allPolicies.length,
    });
  }

  /**
   * Retrieves a single rule by name from the rules service.
   * Optionally includes classification paths if specified.
   */
  public async getRule(args: {
    name: string;
    includeClassifications?: number;
  }) {
    const { name, includeClassifications } = args;

    const result = await this.client.getRule({
      name,
      includeClassifications,
    });

    if (result.isErr()) {
      this.logger.error('RulesService.getRule failed', {
        error: result.error,
        args,
      });
      throw result.error;
    }

    return result.value;
  }

  public async getPoliciesBatch(args: {
    names: string[];
    includeDeprecated?: boolean;
  }) {
    this.logger.info(
      'RulesService.getPoliciesBatch: Loading batch of policies'
    );
    const result = await this.client.getClassificationsBatch(args);

    if (result.isErr()) {
      this.logger.error('RulesService.getPoliciesBatch failed', {
        error: result.error,
        args,
      });
      throw result.error;
    }

    return result.value;
  }

  public async getPoliciesByIds(
    names: string[],
    options?: { includeDeprecated?: boolean }
  ): Promise<Policy[]> {
    const includeDeprecated = options?.includeDeprecated ?? false;
    const uniqueNames = Array.from(new Set(names.filter(Boolean)));
    if (uniqueNames.length === 0) return [];
    const classifications = await this.getPoliciesBatch({
      names: uniqueNames,
      includeDeprecated,
    });
    return classifications.map((c: Classification) =>
      this.classificationToPolicy(c)
    );
  }

  /**
   * Retrieves a paginated list of rules with optional filtering and search.
   * Returns rules, total count, and pagination metadata.
   */
  public async getRulesPage(args?: {
    page?: number;
    perPage?: number;
    query?: string;
    filters?: string[];
    type?: string;
    iacLanguage?: string;
    includeDeprecated?: boolean;
  }) {
    const result = await this.client.getRulesPage(args);

    if (result.isErr()) {
      this.logger.error('RulesService.getRulesPage failed', {
        error: result.error,
        args,
      });
      throw result.error;
    }

    return result.value;
  }

  /**
   * Retrieves a single classification by name from the rules service.
   * Optionally includes parent and children classifications if specified.
   * @deprecated RulesService should not expose Classifications, it should abstract them away and expose higher level concepts like policies.
   */
  public async getClassification(args: {
    name: string;
    parents?: number;
    children?: number;
  }) {
    const { name, parents, children } = args;

    const result = await this.client.getClassification({
      name,
      parents,
      children,
    });

    if (result.isErr()) {
      this.logger.error('RulesService.getClassification failed', {
        error: result.error,
        args,
      });
      throw result.error;
    }

    return result.value;
  }

  /**
   * Retrieves a paginated list of classifications with optional filtering and search.
   * Returns classifications, total count, and pagination metadata.
   */
  public async getClassifications(args?: {
    page?: number;
    perPage?: number;
    query?: string;
    filters?: string[];
    includeDeprecated?: boolean;
  }) {
    const result = await this.client.getClassifications(args);

    if (result.isErr()) {
      this.logger.error('RulesService.getClassifications failed', {
        error: result.error,
        args,
      });
      throw result.error;
    }

    return result.value;
  }

  /**
   * Retrieves a single channel by name from the rules service.
   * Returns channel configuration including query and filters.
   */
  public async getChannel(args: { name: string }) {
    const { name } = args;

    const result = await this.client.getChannel({
      name,
    });

    if (result.isErr()) {
      this.logger.error('RulesService.getChannel failed', {
        error: result.error,
        args,
      });
      throw result.error;
    }

    return result.value;
  }

  /**
   * Safe way to access channels in case you don't want to throw an error if the channel
   * isn't found
   */
  public async getChannelSafe(args: { name: string }) {
    const { name } = args;

    const result = await this.client.getChannel({
      name,
    });

    if (result.isErr()) {
      // Intentionally silent — callers use null to handle missing channels gracefully.
      return null;
    }

    return result.value;
  }

  /**
   * Retrieves a paginated list of rules for a specific channel.
   * Returns rules, total count, and pagination metadata.
   */
  public async getChannelRules(args: {
    name: string;
    filters?: string[];
    page?: number;
    perPage?: number;
  }) {
    const { name, filters, page, perPage } = args;

    const result = await this.client.getChannelRules({
      name,
      filters,
      page,
      perPage,
    });

    if (result.isErr()) {
      this.logger.error('RulesService.getChannelRules failed', {
        error: result.error,
        args,
      });
      throw result.error;
    }

    return result.value;
  }

  /**
   * Creates a new channel in the rules service.
   * Creates a channel with the specified name, query, filters, and annotations.
   */
  public async createChannel(args: {
    name: string;
    query?: string;
    filters?: string[];
    annotations?: {
      [key: string]: unknown;
    };
  }) {
    const result = await this.client.createChannel(args);

    if (result.isErr()) {
      this.logger.error('RulesService.createChannel failed', {
        error: result.error,
        args,
      });
      throw result.error;
    }

    return result.value;
  }

  /**
   * Updates a channel configuration in the rules service.
   * Updates the channel's query, filters, and annotations.
   */
  public async updateChannel(args: {
    name: string;
    query?: string;
    filters?: string[];
    annotations?: {
      [key: string]: unknown;
    };
  }) {
    const result = await this.client.updateChannel(args);

    if (result.isErr()) {
      this.logger.error('RulesService.updateChannel failed', {
        error: result.error,
        args,
      });
      throw result.error;
    }

    return result.value;
  }

  public async searchForChannels(args: {
    query?: string;
    page?: number;
    perPage?: number;
  }) {
    const result = await this.client.searchForChannels(args);

    if (result.isErr()) {
      this.logger.error('RulesService.searchForChannels failed', {
        error: result.error,
        args,
      });
      throw result.error;
    }

    return result.value;
  }

  /**
   * Converts a Classification to a Policy, abstracting away internal details.
   */
  private classificationToPolicy(classification: Classification): Policy {
    return {
      id: classification.name,
      name: classification.shortName || classification.name,
      description: classification.description || null,
      annotations: classification.annotations || null,
    };
  }

  /**
   * @returns all policy classifications for a specific channel
   */
  private async getChannelPolicies(args: {
    channelName: string;
    maxPages?: number;
  }): Promise<Policy[]> {
    const { channelName, maxPages = 50 } = args;
    this.logger.info('RulesService.getChannelPolicies', {
      channelName,
      maxPages,
    });

    /**
     * Converts the rules query that is stored on channel from the (contains "classification_name" $.classification) to the
     * form where we can query the classifications (eq $.name "classification_name")
     * TODO: This might belong in the rules service SDK
     */
    const convertQueryToClassificationQuery = (query: string): string => {
      return query.replace(
        RulesServiceLoader.POLICY_QUERY_SUBSTRING,
        (_, classificationName) => `(eq $.name "${classificationName}")`
      );
    };

    try {
      let channelRes = await this.getChannelSafe({
        name: channelName,
      });

      if (!channelRes) {
        channelRes = await this.getChannelSafe({
          name: this.getDefaultChannelName(),
        });
      }

      if (!channelRes) {
        throw new Error(
          `Channel not found: ${channelName} and default channel ${this.getDefaultChannelName()} also not found`
        );
      }
      const convertedClassificationQuery = convertQueryToClassificationQuery(
        channelRes.query || ''
      );

      // Get classifications for the channel, loading multiple pages up to maxPages
      const perPage = 50;
      const allClassifications: Classification[] = [];
      let currentPage = 1;
      let hasMorePages = true;

      while (hasMorePages && currentPage <= maxPages) {
        const classificationsResult = await this.getClassifications({
          page: currentPage,
          perPage,
          query: convertedClassificationQuery,
        });

        const pageClassifications = classificationsResult.classifications || [];
        allClassifications.push(...pageClassifications);

        const total = classificationsResult.total || 0;
        const totalPages = Math.ceil(total / perPage);

        // Check if there are more pages to fetch
        hasMorePages = currentPage < totalPages;
        currentPage++;
      }

      return allClassifications.map(c => this.classificationToPolicy(c));
    } catch (error) {
      this.logger.error('RulesService.getChannelPolicies failed', {
        error,
        args,
      });
      throw error;
    }
  }

  private getPolicyCountFromChannelQuery(channelQuery: string) {
    const matches =
      channelQuery.match(RulesServiceLoader.POLICY_SET_POLICY_NAME_REGEX) || [];
    return matches.length;
  }

  public async getWorkspaceChannelsWithPolicySet(
    policySetName: string
  ): Promise<Channel[]> {
    const policySetChannelName = this.getPolicySetChannelName(policySetName);
    const cumulativeWorkspaces: Channel[] = [];
    await this.applyToAllWorkspaceChannels(
      `(contains "(channel \\"${policySetChannelName}\\" true)" $.query)`,

      async ({ channels }) => {
        for (const channel of channels) {
          cumulativeWorkspaces.push({
            ...channel,
            createdAt: String(channel.createdAt),
            updatedAt: String(channel.updatedAt),
          });
        }
      }
    );
    return cumulativeWorkspaces;
  }

  private async initializePolicySets() {
    const defaultAndGlobalChannelData = await this.searchForChannels({
      page: 1,
      perPage: 2,
      query: `(or (eq $.name "${this.getDefaultChannelName()}") (eq $.name "${this.getAccountGlobalChannelName()}"))`,
    });

    if (defaultAndGlobalChannelData.channels != null) {
      const channels = defaultAndGlobalChannelData.channels;
      const globalChannelName = this.getAccountGlobalChannelName();
      const defaultChannelName = this.getDefaultChannelName();
      const globalChannelExists = channels.some(
        (c: Channel) => c.name === globalChannelName
      );

      if (!globalChannelExists) {
        await this.loadAllPolicies();
        const defaultQuery = this.getPolicySetQuery(
          this.allPolicies.map(p => p.id)
        );
        const result = await this.client.batchUpsertChannels({
          channels: [
            {
              name: globalChannelName,
              query: mergeSearchQueryWithDeprecatedFilter(
                `(or ${this.getDefaultChannelQuery()})`,
                false
              ),
              annotations: {
                'gomboc-ai/created-by': 'Gomboc.AI',
                'gomboc-ai/updated-by': 'Gomboc.AI',
                'gomboc-ai/is-default': false,
                'gomboc-ai/apply-to-all-workspaces': true,
              },
            },
            {
              name: defaultChannelName,
              ...(defaultQuery && {
                query: this.ensureDeprecatedFilter(defaultQuery),
              }),
              annotations: {
                'gomboc-ai/description': 'The default policy set',
                'gomboc-ai/type': 'policy-set',
                'gomboc-ai/created-by': 'Gomboc.AI',
                'gomboc-ai/updated-by': 'Gomboc.AI',
                'gomboc-ai/is-default': true,
                'gomboc-ai/apply-to-all-workspaces': true,
              },
            },
          ],
        });
        if (result.isErr()) {
          this.logger.error('RulesService.batchUpsertChannels failed', {
            error: result.error,
            channelNames: [globalChannelName, defaultChannelName],
          });
          throw result.error;
        }
      }
    }
  }

  public async getPolicySets(
    page?: number,
    perPage?: number
  ): Promise<PolicySetPage> {
    const res = await this.searchForChannels({
      page,
      perPage,
      query: '(eq $.annotations.gomboc-ai/type "policy-set")',
    });
    const exceptionCountsByPolicySet =
      await this.getExceptionCountsByPolicySetName();
    const modifiedChannels = await Promise.all(
      res.channels.map(async (channel: Channel) => {
        const policySetName = this.getPolicySetNameFromChannelName(
          channel.name
        );
        const isAppliedToAllWorkspaces =
          this.getShouldApplyToAllWorkspaces(channel) ?? false;
        const description = this.getDescriptionAnnotation(channel);
        const appliedWorkspaceChannelNames = isAppliedToAllWorkspaces
          ? undefined
          : (await this.getWorkspaceChannelsWithPolicySet(policySetName))
              .map(channel =>
                this.getWorkspaceIdFromWorkspaceChannelName(channel.name)
              )
              .sort((a, b) => a.localeCompare(b));

        return {
          ...channel,
          name: policySetName,
          createdBy: this.getCreatedByAnnotation(channel) ?? '',
          ...(description && { description }),
          isDefault: this.getIsDefault(channel) ?? false,
          createdAt: String(channel.createdAt),
          updatedAt: String(channel.updatedAt),
          ...(appliedWorkspaceChannelNames && { appliedWorkspaceChannelNames }),
          policiesCount: this.getPolicyCountFromChannelQuery(
            channel.query ?? ''
          ),
          exceptionsCount: exceptionCountsByPolicySet.get(policySetName) ?? 0,
          isAppliedToAllWorkspaces,
          updatedBy: this.getUpdatedBy(channel) ?? '',
        };
      })
    );
    return {
      items: modifiedChannels,
      perPage: res.perPage,
      page: res.page,
      total: res.total,
    };
  }
  public async getPolicySet(policySetName: string): Promise<PolicySet> {
    const channel = await this.getChannel({
      name: this.getPolicySetChannelName(policySetName),
    });
    const isAppliedToAllWorkspaces =
      this.getShouldApplyToAllWorkspaces(channel) ?? false;
    const description = this.getDescriptionAnnotation(channel);
    const workspaceChannels = isAppliedToAllWorkspaces
      ? []
      : await this.getWorkspaceChannelsWithPolicySet(
          this.getPolicySetNameFromChannelName(channel.name)
        );
    const appliedWorkspaceChannelNames =
      workspaceChannels.length > 0
        ? workspaceChannels
            .map(ch => ch.name)
            .sort((a, b) => a.localeCompare(b))
        : undefined;
    const appliedWorkspaceIds =
      workspaceChannels.length > 0
        ? workspaceChannels
            .map(ch => this.getWorkspaceIdFromWorkspaceChannelName(ch.name))
            .sort((a, b) => a.localeCompare(b))
        : undefined;

    const linkedExceptions = await this.getExceptionsLinkedToPolicySet({
      policySetName,
    });

    return {
      ...channel,
      name: this.getPolicySetNameFromChannelName(channel.name),
      createdBy: this.getCreatedByAnnotation(channel) ?? '',
      ...(description && { description }),
      isDefault: this.getIsDefault(channel) ?? false,
      createdAt: String(channel.createdAt),
      updatedAt: String(channel.updatedAt),
      ...(appliedWorkspaceChannelNames && { appliedWorkspaceChannelNames }),
      ...(appliedWorkspaceIds && { appliedWorkspaceIds }),
      policiesCount: this.getPolicyCountFromChannelQuery(channel.query ?? ''),
      exceptionsCount: linkedExceptions.length,
      isAppliedToAllWorkspaces,
      updatedBy: this.getUpdatedBy(channel) ?? '',
    };
  }

  public async getPolicySetPolicies(policySet: PolicySet): Promise<Policy[]> {
    if (!policySet.query) {
      return [];
    }
    if (this.allPolicies.length === 0) {
      await this.loadAllPolicies();
    }

    // Extract policy names from query like (contains "name" finding.classification)
    const matches = policySet.query.matchAll(
      RulesServiceLoader.POLICY_SET_POLICY_NAME_REGEX
    );
    const policyNames = Array.from(matches, m => m[1]);
    // Match policy names with allPolicies to get Policy objects
    return this.allPolicies.filter(p => policyNames.includes(p.id));
  }

  private getPolicyNamesFromQuery(query: string): string[] {
    const matches = query.matchAll(
      RulesServiceLoader.POLICY_SET_POLICY_NAME_REGEX
    );
    return Array.from(matches, m => m[1]);
  }

  /**
   * Ensures the query has the deprecated filter attached as a direct child of the top-level (and),
   * e.g. (and (or (channel "..." true) ) (not (eq $.annotations["deprecated"] "true"))).
   * If already present in that form, returns query unchanged; otherwise adds it.
   */
  private ensureDeprecatedFilter(query: string): string {
    return ensureDeprecatedFilterOnQuery(query);
  }

  private attachPolicySetToWorkspaceChannelQuery(
    workspaceQuery: string = '',
    policySetName: string
  ) {
    const trimmedWorkspaceQuery = workspaceQuery.trim();
    const policySetChannelName = this.getPolicySetChannelName(policySetName);
    const escapedChannelName = policySetChannelName.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&'
    );
    // Require whitespace or " immediately after so we match the exact channel name only
    if (
      new RegExp(escapedChannelName + '(?=[\\s"])').test(trimmedWorkspaceQuery)
    ) {
      return this.ensureDeprecatedFilter(workspaceQuery);
    }

    // First match "(and", then match "(and (or" (with varying whitespace) — does not match plain "(or"
    const startsWithAnd = /^\s*\(\s*and\s*/i.test(trimmedWorkspaceQuery);
    const startsWithAndOr = /^\s*\(\s*and\s*\(\s*or\s*/i.test(
      trimmedWorkspaceQuery
    );
    const policySetChannel = `(channel "${policySetChannelName}" true)`;
    if (startsWithAndOr) {
      // Add policy set channel within the existing (or ...) — find the closing paren of the first (or
      const firstOrMatch = trimmedWorkspaceQuery.match(/\(\s*or\s/i);
      const openParenIndex =
        firstOrMatch && firstOrMatch.index !== undefined
          ? firstOrMatch.index
          : -1;
      let insertAtIndex = -1;
      if (openParenIndex !== -1) {
        let depth = 0;
        for (let i = openParenIndex; i < trimmedWorkspaceQuery.length; i++) {
          const c = trimmedWorkspaceQuery[i];
          if (c === '(') depth++;
          else if (c === ')') {
            depth--;
            if (depth === 0) {
              insertAtIndex = i;
              break;
            }
          }
        }
      }
      if (insertAtIndex !== -1) {
        const beforeInsert = trimmedWorkspaceQuery.substring(0, insertAtIndex);
        const afterInsert = trimmedWorkspaceQuery.substring(insertAtIndex);
        return this.ensureDeprecatedFilter(
          `${beforeInsert} ${policySetChannel}${afterInsert}`
        );
      }
      return this.ensureDeprecatedFilter(workspaceQuery);
    } else if (startsWithAnd) {
      // Has (and but no (or: wrap inner content in (or ... (channel ...))
      const andMatch = trimmedWorkspaceQuery.match(/^\s*\(\s*and\s*/i);
      if (andMatch) {
        const indexAfterAnd = andMatch.index! + andMatch[0].length;
        const innerContent = trimmedWorkspaceQuery.substring(
          indexAfterAnd,
          trimmedWorkspaceQuery.length - 1
        );
        return this.ensureDeprecatedFilter(
          `(and (or ${innerContent} ${policySetChannel}))`
        );
      }
      return this.ensureDeprecatedFilter(workspaceQuery);
    }

    return this.ensureDeprecatedFilter(
      `(and (or ${trimmedWorkspaceQuery} ${policySetChannel}))`
    );
  }

  /**
   * Extracts policy set names from a channel query string.
   * Matches (channel "accountId/set/PolicySetName" true) and returns the PolicySetName parts.
   */
  private getPolicySetNamesFromChannelQuery(query: string): string[] {
    if (!query?.trim()) return [];
    const prefix = `${this.accountId}/set/`;
    const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\(channel\\s+"${escapedPrefix}([^"]+)"`, 'g');
    const names: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(query)) !== null) {
      names.push(match[1]);
    }
    return names;
  }

  public async getWorkspacePolicySets(workspaceId: string): Promise<string[]> {
    const globalChannelRes = await this.client.getChannel({
      name: this.getAccountGlobalChannelName(),
    });
    const workspaceChannelRes = await this.client.getChannel({
      name: this.getWorkspaceChannelsName(workspaceId),
    });

    const policySetNames = new Set<string>();

    if (globalChannelRes.isOk() && globalChannelRes.value?.query) {
      this.getPolicySetNamesFromChannelQuery(
        globalChannelRes.value.query
      ).forEach(name => policySetNames.add(name));
    }

    if (workspaceChannelRes.isOk() && workspaceChannelRes.value?.query) {
      this.getPolicySetNamesFromChannelQuery(
        workspaceChannelRes.value.query
      ).forEach(name => policySetNames.add(name));
    }

    return Array.from(policySetNames);
  }

  private async getUpdatedPolicySetAppliedWorkspacesArg(
    workspaceIds: string[],
    policySetName: string,
    updatedBy: string
  ): Promise<BatchUpsertChannelsRequestParams> {
    const allWorkspaceChannelNames = workspaceIds.map(id =>
      this.getWorkspaceChannelsName(id)
    );
    const existingWorkspaceChannels: Channel[] = [];

    const finalUpsertArgs: BatchUpsertChannelsRequestParams = {
      channels: [],
    };
    await this.applyToAllWorkspaceChannels(
      `(contains "(channel \\"${this.getPolicySetChannelName(policySetName)}\\" true" $.query)`,
      async ({ channels, total }) => {
        existingWorkspaceChannels.push(...channels);
        // All workspaces have been found and the other workspace channels need to be created
        if (existingWorkspaceChannels.length === total) {
          const existingWorkspaceChannelNames = existingWorkspaceChannels.map(
            channel => channel.name
          );
          const nonExistingWorkspaceChannels = allWorkspaceChannelNames.filter(
            name => !existingWorkspaceChannelNames.includes(name)
          );
          const batchCreateArgs = nonExistingWorkspaceChannels.map(channel => {
            return {
              name: channel,
              query: this.attachPolicySetToWorkspaceChannelQuery(
                this.getGlobalChannelQuery(),
                policySetName
              ),
              annotations: {
                'gomboc-ai/updated-by': updatedBy,
              },
            };
          });
          // All workspaceIds mentioned within the existing worspace channels list, but not
          // within the workspaceIds function argument need to be updated to exclude the policy set
          // from the query
          const excludedWorkspaces = existingWorkspaceChannels.filter(
            channel => !allWorkspaceChannelNames.includes(channel.name)
          );

          const batchRemoveArgs = excludedWorkspaces.map(channel => {
            return {
              id: channel.id,
              name: channel.name,
              query: this.removePolicySetFromWorkspaceChannelQuery(
                policySetName,
                channel.query
              ),
              annotations: {
                ...channel.annotations,
                'gomboc-ai/updated-by': updatedBy,
              },
            };
          });
          finalUpsertArgs.channels.push(...batchCreateArgs, ...batchRemoveArgs);
        }
      }
    );
    return finalUpsertArgs;
  }

  private getPolicySetQuery(updatedPolicyNameList: string[]) {
    const uniquePolicyNames = [...new Set(updatedPolicyNameList)];
    const updatedPolicyQueries = uniquePolicyNames.map(
      name => `(contains "${name}" finding.classification)`
    );
    const newPolicySetQuery = `(or ${updatedPolicyQueries.join(' ')})`;

    if (newPolicySetQuery === '(or )') {
      return '';
    }

    return this.ensureDeprecatedFilter(newPolicySetQuery);
  }

  /**
   * Policy set `filters` entries for exceptions use the channel predicate form
   * `(channel "<full channel path>" true)`.
   */
  private escapeChannelPathForChannelPredicate(path: string): string {
    return path.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  private policySetExceptionChannelFilterClause(
    exceptionChannelName: string
  ): string {
    const escaped = this.escapeChannelPathForChannelPredicate(
      exceptionChannelName.trim()
    );
    return `(channel "${escaped}" true)`;
  }

  private policySetFiltersAlreadyReferenceExceptionChannel(
    currentFilters: string[],
    exceptionChannelName: string
  ): boolean {
    const name = exceptionChannelName.trim();
    if (!name) {
      return true;
    }
    return currentFilters.includes(
      this.policySetExceptionChannelFilterClause(name)
    );
  }

  /** Appends the exception channel filter clause to the policy set channel's filters when missing. */
  private mergePolicySetFiltersWithExceptionChannelName(
    currentFilters: string[],
    exceptionChannelName: string
  ): string[] {
    const name = exceptionChannelName.trim();
    if (!name) {
      return currentFilters;
    }
    if (
      this.policySetFiltersAlreadyReferenceExceptionChannel(
        currentFilters,
        name
      )
    ) {
      return currentFilters;
    }
    return [
      ...currentFilters,
      this.policySetExceptionChannelFilterClause(name),
    ];
  }

  /** Removes the exception channel predicate from a policy set `filters` list. */
  private filtersWithoutExceptionChannelClause(
    filters: string[],
    exceptionChannelName: string
  ): string[] {
    const clause =
      this.policySetExceptionChannelFilterClause(exceptionChannelName);
    return filters.filter(f => f !== clause);
  }

  private buildSagaRollbackError(args: {
    error: SagaExecutionError;
    correlationId: string;
    operation: string;
  }): SagaRollbackError {
    const { error, correlationId, operation } = args;
    const originalError = extractErrorInfo(error.originalError);
    const compensationFailures = error.compensationFailures.map(
      (failure: SagaCompensationFailure) => ({
        step: failure.step,
        message: extractErrorInfo(failure.error).message,
      })
    );
    const rollbackStatus =
      compensationFailures.length > 0 ? 'partial' : 'completed';

    return new SagaRollbackError({
      message:
        rollbackStatus === 'partial'
          ? `Exception ${operation} failed and rollback only partially completed.`
          : `Exception ${operation} failed but rollback completed successfully.`,
      failedStep: error.failedStep,
      rollbackStatus,
      compensationFailures,
      correlationId,
      originalError,
    });
  }

  public async createPolicySet(args: CreatePolicySetArgs) {
    const {
      name,
      query,
      description,
      annotations,
      createdBy,
      applyToAllWorkspaces,
      workspaceIds,
    } = args;
    if (applyToAllWorkspaces && workspaceIds) {
      throw new Error(
        'Unable to determine if policy set should be applied to all Workspaces'
      );
    }
    const policySetChannelName = this.getPolicySetChannelName(name);

    const existingPolicySetName = await this.client.getChannel({
      name: policySetChannelName,
    });
    if (
      existingPolicySetName.isErr() &&
      existingPolicySetName.error.statusCode !== 404
    ) {
      throw new RulesServiceError(
        'Currently unable to create a policy set',
        'SERVICE_UNAVAILABLE',
        503
      );
    }
    if (existingPolicySetName.isOk() && existingPolicySetName.value != null) {
      throw new RulesServiceError(
        'Name is already taken',
        'POLICY_SET_NAME_TAKEN',
        409
      );
    }

    const finalAnnotations = {
      ...annotations,
      'gomboc-ai/description': description,
      'gomboc-ai/type': 'policy-set',
      'gomboc-ai/created-by': createdBy,
      'gomboc-ai/updated-by': createdBy,
      'gomboc-ai/is-default': false,
      'gomboc-ai/apply-to-all-workspaces': applyToAllWorkspaces,
    };

    const channelsToUpsert: BatchUpsertChannelsRequestParams['channels'] = [
      {
        name: policySetChannelName,
        query,
        annotations: finalAnnotations,
      },
    ];

    if (applyToAllWorkspaces) {
      const globalChannelRes = await this.getChannelSafe({
        name: this.getAccountGlobalChannelName(),
      });
      const globalChannelBaseQuery = globalChannelRes?.query ?? '';
      const updatedGlobalQuery = this.attachPolicySetToWorkspaceChannelQuery(
        globalChannelBaseQuery,
        name
      );
      channelsToUpsert.push({
        name: this.getAccountGlobalChannelName(),
        query: updatedGlobalQuery,
        ...(globalChannelRes?.annotations && {
          annotations: globalChannelRes.annotations,
        }),
      });
    }

    const upsertResult = await this.client.batchUpsertChannels({
      channels: channelsToUpsert,
    });
    if (upsertResult.isErr()) {
      this.logger.error(
        'RulesService.createPolicySet batchUpsertChannels failed',
        {
          error: upsertResult.error,
          name,
        }
      );
      throw upsertResult.error;
    }

    if (!applyToAllWorkspaces && workspaceIds) {
      try {
        const workspaceUpsertArgs =
          await this.getUpdatedPolicySetAppliedWorkspacesArg(
            workspaceIds,
            name,
            createdBy
          );
        const result =
          await this.client.batchUpsertChannels(workspaceUpsertArgs);
        if (result.isErr()) {
          throw result.error;
        }
      } catch {
        this.logger.error('Unable to fetch workspace args and upsert channels');
      }
    }

    const policySetResult = upsertResult.value.results.find(
      (r: BatchUpsertChannelResult) => r.name === policySetChannelName
    );
    const channel = policySetResult?.channel;
    if (!channel) {
      throw new Error(
        `RulesService.createPolicySet: no channel data returned for ${policySetChannelName}`
      );
    }
    return {
      ...channel,
      name: this.getPolicySetNameFromChannelName(channel.name),
      exceptionsCount: 0,
    };
  }

  private async applyToAllWorkspaceChannels(
    workspaceQuery: string,
    fn: (args: {
      channels: Channel[];
      page: number;
      perPage: number;
      total: number;
    }) => Promise<void>
  ) {
    let currentPage = 1;
    let totalReceived: number | null = null;
    const PAGE_SIZE = 200;
    let accumulatedTotal = 0;

    const MAX_ITERATIONS = 10;

    try {
      do {
        const channelPage = await this.searchForChannels({
          query: workspaceQuery,
          page: currentPage,
          perPage: PAGE_SIZE,
        });

        const { channels, page, perPage, total } = channelPage;

        if (totalReceived == null) {
          totalReceived = total;
        }
        currentPage++;
        accumulatedTotal += channelPage.channels.length;
        await fn({
          channels,
          page,
          perPage,
          total,
        });
      } while (
        totalReceived != null &&
        accumulatedTotal < totalReceived &&
        currentPage - 1 < MAX_ITERATIONS
      );
    } catch (e) {
      this.logger.error(
        'RulesServiceLoader._applyToAllWorkspaceChannels failed to iterate through all workspaces'
      );
      throw e;
    }
  }

  /**
   * Fetches all results from /api/v1/classifications/search via getAllClassifications
   * and invokes the callback with the full list.
   */
  private async applyToAllFrameworks(
    args: {
      query?: string;
      filters?: string[];
    },
    fn: (args: {
      classifications: Classification[];
      page: number;
      perPage: number;
      total: number;
    }) => Promise<void>
  ) {
    try {
      const result = await this.client.getAllClassifications({
        params: {
          query: args.query,
          filters: args.filters,
        },
      });

      if (result.isErr()) {
        this.logger.error('RulesServiceLoader.applyToAllFrameworks failed', {
          error: result.error,
          args,
        });
        throw result.error;
      }

      const { classifications, page, perPage, total } = result.value;
      await fn({
        classifications,
        page,
        perPage,
        total,
      });
    } catch (e) {
      this.logger.error(
        'RulesServiceLoader._applyToAllFrameworks failed to fetch classifications'
      );
      throw e;
    }
  }

  private removePolicySetFromWorkspaceChannelQuery(
    policySetName: string,
    workspaceChannelQuery?: string
  ) {
    if (workspaceChannelQuery == null) {
      return;
    }
    // Query stores the channel name (e.g. "4a14c841-a133-400f-bd27-a70dfbef6a0a/set/1"), not the display name
    const channelName = this.getPolicySetChannelName(policySetName);
    const escapedChannelName = channelName.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&'
    );
    // Matches: (channel "channelName" true) with flexible whitespace
    const policySetQuery = new RegExp(
      `\\(\\s*channel\\s+"${escapedChannelName}"\\s*true\\s*\\)`
    );
    const finalQuery = workspaceChannelQuery.replace(policySetQuery, '').trim();

    if (this.isQueryEmpty(finalQuery)) {
      return '';
    }
    // If no channels remain (e.g. only (and (not (eq $.annotations["deprecated"] "true")))), return empty
    if (!/\(\s*channel\s+"/.test(finalQuery)) {
      return '';
    }
    return finalQuery;
  }

  private async removePolicySetFromWorkspaceChannels(policySetName: string) {
    const policySetNameQuery = `(contains "(channel \\"${this.getPolicySetChannelName(policySetName)}\\" true)" $.query)`;

    try {
      await this.applyToAllWorkspaceChannels(
        policySetNameQuery,
        async ({ channels }) => {
          const modifiedChannels = channels.map(channel => {
            return {
              ...channel,
              query: this.removePolicySetFromWorkspaceChannelQuery(
                policySetName,
                channel.query
              ),
            };
          });
          if (modifiedChannels.length > 0) {
            const result = await this.client.batchUpsertChannels({
              channels: modifiedChannels,
            });
            if (result.isErr()) {
              throw result.error;
            }
          }
        }
      );
    } catch (e) {
      this.logger.error(
        'RulesService._removePolicySetFromWorkspaceChannels failed. Unable to remove policy sets from all workspaces'
      );
      throw e;
    }
  }

  public async deletePolicySet(args: { name: string }) {
    const { name } = args;
    const linkedExceptions = await this.getExceptionsLinkedToPolicySet({
      policySetName: name,
    });
    for (const exception of linkedExceptions) {
      await this.deleteException({ name: exception.name });
    }

    await this.removePolicySetFromWorkspaceChannels(name);
    const deleteRes = await this.client.deleteChannel({
      name: this.getPolicySetChannelName(name),
    });

    if (deleteRes.isOk() && deleteRes.value.success) {
      return true;
    }
    this.logger.error('RulesService.deletePolicySet failed', {
      error: deleteRes.isErr()
        ? deleteRes.error.message
        : 'Unable to delete policy set',
      args,
    });
    throw new Error('Unable to delete policy set');
  }

  public async updatePolicySet(args: UpdatePolicySetArgs) {
    const {
      name,
      updatedBy,
      description,
      applyToAllWorkspaces,
      policyNames,
      workspaceIds,
      frameworkNames,
    } = args;
    if (applyToAllWorkspaces && workspaceIds) {
      throw new Error(
        'Unable to determine if policy set should be applied to all Workspaces for the update'
      );
    }
    const policySetRes = await this.client.getChannel({
      name: this.getPolicySetChannelName(name),
    });

    if (policySetRes.isErr() || policySetRes.value == null) {
      throw new Error(`Unable to retrieve policy set "${name}"`);
    }

    const currentPolicySet = policySetRes.value;

    const finalPolicySetState = { ...currentPolicySet };
    let modifiedWorkspaceChannels: BatchUpsertChannelsRequestParams | undefined;
    if (finalPolicySetState['annotations'] == null) {
      throw new Error('Invalid policy set state, annotations are not provided');
    }

    finalPolicySetState['annotations']['gomboc-ai/updated-by'] = updatedBy;
    if (description) {
      finalPolicySetState['annotations']['gomboc-ai/description'] = description;
    }
    if (applyToAllWorkspaces != null) {
      finalPolicySetState['annotations']['gomboc-ai/apply-to-all-workspaces'] =
        applyToAllWorkspaces;
      modifiedWorkspaceChannels =
        await this.getUpdatedPolicySetAppliedWorkspacesArg([], name, updatedBy);
    }
    if (!applyToAllWorkspaces && workspaceIds != null) {
      modifiedWorkspaceChannels =
        await this.getUpdatedPolicySetAppliedWorkspacesArg(
          workspaceIds,
          name,
          updatedBy
        );
    }
    if (frameworkNames) {
      const frameworkPolicies = await this.getFrameworkPolicies(frameworkNames);
      if (policyNames) {
        finalPolicySetState['query'] = this.getPolicySetQuery([
          ...policyNames,
          ...frameworkPolicies,
        ]);
      } else {
        const currentPolicies = this.getPolicyNamesFromQuery(
          currentPolicySet.query ?? ''
        );
        finalPolicySetState['query'] = this.getPolicySetQuery([
          ...currentPolicies,
          ...frameworkPolicies,
        ]);
      }
    } else if (policyNames) {
      finalPolicySetState['query'] = this.getPolicySetQuery(policyNames);
    }

    const channelsToUpsert: BatchUpsertChannelsRequestParams['channels'] = [
      finalPolicySetState,
    ];
    const globalChannelRes = await this.getChannelSafe({
      name: this.getAccountGlobalChannelName(),
    });
    const globalChannel = globalChannelRes ?? undefined;
    if (globalChannel && applyToAllWorkspaces != null) {
      const updatedGlobalQuery = applyToAllWorkspaces
        ? this.attachPolicySetToWorkspaceChannelQuery(
            globalChannel.query ?? '',
            name
          )
        : (this.removePolicySetFromWorkspaceChannelQuery(
            name,
            globalChannel.query
          ) ?? '');
      const finalQuery = this.ensureDeprecatedFilter(updatedGlobalQuery);
      channelsToUpsert.push({
        name: this.getAccountGlobalChannelName(),
        query:
          typeof finalQuery === 'string' && finalQuery !== ''
            ? finalQuery
            : undefined,
        ...(globalChannel.annotations && {
          annotations: globalChannel.annotations,
        }),
      });
    }

    try {
      const result = await this.client.batchUpsertChannels({
        channels: [
          ...channelsToUpsert,
          ...(modifiedWorkspaceChannels?.channels ?? []),
        ],
      });
      if (result.isErr()) {
        throw result.error;
      }
    } catch (error) {
      this.logger.error('RuleServiceLoader.updatePolicySet: Unable to upsert', {
        error,
      });
      throw error;
    }
  }

  private async getFrameworkPolicies(frameworks: string[]) {
    if (this.allPolicies.length === 0) {
      await this.loadAllPolicies();
    }
    const validPolicyIds = new Set(this.allPolicies.map(p => p.id));
    const allPolicyNames = new Set<string>();
    for (const framework of frameworks) {
      const receivedFramework = await this.client.getClassification({
        name: framework,
      });
      if (receivedFramework.isOk()) {
        const frameworkData = receivedFramework.value;
        const relatedAnnotation =
          frameworkData.annotations?.['gomboc-ai/related'];
        if (typeof relatedAnnotation === 'string') {
          const policyNames = relatedAnnotation
            .split('\n')
            .map(s => s.trim())
            .filter(s => s.startsWith('gomboc-ai/policy'))
            .filter(s => validPolicyIds.has(s));
          for (const policyName of policyNames) {
            allPolicyNames.add(policyName);
          }
        }
      } else {
        throw new Error(`Unable to retreive framework ${framework}`);
      }
    }
    return Array.from(allPolicyNames);
  }

  public async getFrameworks() {
    const res = await this.client.getAllClassifications({
      params: {
        query: '(eq $.annotations["gomboc-ai/type"] "framework")',
      },
    });
    if (res.isErr()) {
      throw new Error('Unable to fetch frameworks');
    }
    return res.value.classifications;
  }

  // ------------------------- Exceptions -----------------------------

  /**
   * Creates an exception: one channel whose `query` matches **all** given rule names
   * (OR of `(eq $.name …)`), and a `(channel "<exception path>" true)` filter clause is
   * then appended to **each** selected policy set channel's `filters` (each policy set's
   * own `query` is unchanged).
   * Runs as a saga so a failure after partial progress rolls back: updated policy
   * sets are restored from snapshots, then the exception channel is deleted if it
   * was created.
   */
  public async createException(args: CreateExceptionArgs) {
    const { name, rules, policySets, createdBy, description } = args;
    const createdAt = new Date().toISOString();
    const exceptionChannelName = this.getExceptionChannelName(name);

    const query =
      rules.length > 0
        ? `(or ${rules.map(ruleName => `(eq $.name "${ruleName}")`).join(' ')})`
        : '';

    const ctx: CreateExceptionSagaContext = {
      exceptionChannelCreated: false,
      policySetStepState: {},
    };

    const steps: SagaStep[] = [];

    steps.push({
      name: 'create_exception_channel',
      execute: async () => {
        const res = await this.client.createChannel({
          query,
          name: exceptionChannelName,
          annotations: {
            'gomboc-ai/created-at': createdAt,
            'gomboc-ai/created-by': createdBy,
            'gomboc-ai/rules': rules,
            'gomboc-ai/policy-sets': policySets,
            'gomboc-ai/description': description,
          },
        });

        if (res.isErr()) {
          // 409 means the channel was created by a previous attempt that timed out
          // before its response arrived. Mark it as created so compensation deletes it.
          if (res.error.statusCode === 409) {
            ctx.exceptionChannelCreated = true;
          }
          throw res.error;
        }
        ctx.exceptionChannelCreated = true;
      },
      compensate: async () => {
        if (!ctx.exceptionChannelCreated) {
          return;
        }
        const deleteRes = await this.client.deleteChannel({
          name: exceptionChannelName,
        });
        if (deleteRes.isErr() || !deleteRes.value.success) {
          throw new Error(
            `Failed to rollback exception channel "${exceptionChannelName}"`
          );
        }
      },
    });

    for (const policySetName of policySets) {
      const policySetChannelName = this.getPolicySetChannelName(policySetName);
      ctx.policySetStepState[policySetName] = {
        channelName: policySetChannelName,
        snapshot: null,
        didUpdate: false,
      };

      steps.push({
        name: `attach_exception_filter_to_policy_set:${policySetName}`,
        execute: async () => {
          const state = ctx.policySetStepState[policySetName];
          const channelResponse = await this.getChannelSafe({
            name: state.channelName,
          });
          if (!channelResponse) {
            throw new Error(
              `Policy set channel not found for policy set "${policySetName}"`
            );
          }

          const snap = channelResponse;
          state.snapshot = snap;
          const prevFilters = snap.filters ?? [];
          const nextFilters =
            this.mergePolicySetFiltersWithExceptionChannelName(
              prevFilters,
              exceptionChannelName
            );
          if (
            nextFilters.length === prevFilters.length &&
            nextFilters.every((f, i) => f === prevFilters[i])
          ) {
            return;
          }

          await this.updateChannel({
            name: state.channelName,
            query: snap.query,
            filters: nextFilters,
            annotations: snap.annotations,
          });
          state.didUpdate = true;
        },
        compensate: async () => {
          const state = ctx.policySetStepState[policySetName];
          if (!state.didUpdate || !state.snapshot) {
            return;
          }
          await this.updateChannel({
            name: state.channelName,
            query: state.snapshot.query,
            filters: state.snapshot.filters,
            annotations: state.snapshot.annotations,
          });
        },
      });
    }

    try {
      await runSaga(
        steps,
        createSagaEventLogger({
          logger: toSagaAccessLogger(this.logger),
          namespace: 'RulesService',
          operation: 'createException',
          context: { exceptionChannelName },
        })
      );
    } catch (error) {
      if (error instanceof SagaExecutionError) {
        const rollbackError = this.buildSagaRollbackError({
          error,
          correlationId: exceptionChannelName,
          operation: 'creation',
        });
        this.logger.error('RulesService.createException: saga rollback error', {
          ...rollbackError.toJSON(),
        });
        throw rollbackError;
      }
      throw error;
    }
  }

  /**
   * Deletes an exception: removes its `(channel "<path>" true)` clause from each listed
   * policy set's `filters`, then deletes the exception channel. Runs as a saga so a
   * failure rolls back completed policy set updates from snapshots; if deletion fails
   * after filters were cleared, policy sets are restored the same way.
   */
  public async deleteException(args: DeleteExceptionArgs) {
    const exception = await this.getException({ name: args.name });
    const exceptionChannelName = this.getExceptionChannelName(args.name);
    const policySets = exception.policySets;

    const ctx: DeleteExceptionSagaContext = {
      policySetStepState: {},
    };

    const steps: SagaStep[] = [];

    for (const policySetName of policySets) {
      const policySetChannelName = this.getPolicySetChannelName(policySetName);
      ctx.policySetStepState[policySetName] = {
        channelName: policySetChannelName,
        snapshot: null,
        didUpdate: false,
      };

      steps.push({
        name: `detach_exception_filter_from_policy_set:${policySetName}`,
        execute: async () => {
          const state = ctx.policySetStepState[policySetName];
          const channelResponse = await this.getChannelSafe({
            name: state.channelName,
          });
          if (!channelResponse) {
            throw new Error(
              `Policy set channel not found for policy set "${policySetName}"`
            );
          }

          const snap = channelResponse;
          state.snapshot = snap;
          const prevFilters = snap.filters ?? [];
          const nextFilters = this.filtersWithoutExceptionChannelClause(
            prevFilters,
            exceptionChannelName
          );
          if (
            nextFilters.length === prevFilters.length &&
            nextFilters.every((f, i) => f === prevFilters[i])
          ) {
            return;
          }

          await this.updateChannel({
            name: state.channelName,
            query: snap.query,
            filters: nextFilters,
            annotations: snap.annotations,
          });
          state.didUpdate = true;
        },
        compensate: async () => {
          const state = ctx.policySetStepState[policySetName];
          if (!state.didUpdate || !state.snapshot) {
            return;
          }
          await this.updateChannel({
            name: state.channelName,
            query: state.snapshot.query,
            filters: state.snapshot.filters,
            annotations: state.snapshot.annotations,
          });
        },
      });
    }

    steps.push({
      name: 'delete_exception_channel',
      execute: async () => {
        const deleteRes = await this.client.deleteChannel({
          name: exceptionChannelName,
        });
        if (deleteRes.isErr()) {
          throw deleteRes.error;
        }
        if (!deleteRes.value.success) {
          throw new Error(
            `Failed to delete exception channel "${exceptionChannelName}"`
          );
        }
      },
    });

    try {
      await runSaga(
        steps,
        createSagaEventLogger({
          logger: toSagaAccessLogger(this.logger),
          namespace: 'RulesService',
          operation: 'deleteException',
          context: { exceptionChannelName },
        })
      );
    } catch (error) {
      if (error instanceof SagaExecutionError) {
        const rollbackError = this.buildSagaRollbackError({
          error,
          correlationId: exceptionChannelName,
          operation: 'deletion',
        });
        this.logger.error('RulesService.deleteException: saga rollback error', {
          ...rollbackError.toJSON(),
        });
        throw rollbackError;
      }
      throw error;
    }
  }

  /**
   * Fetches a single exception by short name (the same `name` passed to {@link createException}).
   */
  public async getException(args: { name: string }): Promise<Exception> {
    const res = await this.getChannel({
      name: this.getExceptionChannelName(args.name),
    });
    return this.channelToException(res);
  }

  /**
   * Lists exception channels for this account via channel search on the `accountId/exception/` name prefix.
   */
  public async getExceptions(args?: {
    page?: number;
    perPage?: number;
  }): Promise<ExceptionPage> {
    const res = await this.searchForChannels({
      page: args?.page,
      perPage: args?.perPage,
      query: `(contains "${this.accountId}/exception/" $.name)`,
    });
    const items = res.channels.map((ch: Channel) =>
      this.channelToException(ch)
    );
    return {
      items,
      total: res.total,
      page: res.page,
      perPage: res.perPage,
    };
  }

  /**
   * One pass over all exception pages: how many exceptions reference each policy set short name.
   */
  private async getExceptionCountsByPolicySetName(): Promise<
    Map<string, number>
  > {
    const perPage = 100;
    let page = 1;
    let total = 0;
    const counts = new Map<string, number>();

    do {
      const result = await this.getExceptions({ page, perPage });
      total = result.total;
      for (const exception of result.items) {
        for (const setName of exception.policySets) {
          counts.set(setName, (counts.get(setName) ?? 0) + 1);
        }
      }
      page += 1;
    } while ((page - 1) * perPage < total);

    return counts;
  }

  /**
   * Loads all exceptions linked to the specified policy set name.
   */
  public async getExceptionsLinkedToPolicySet(args: {
    policySetName: string;
  }): Promise<Exception[]> {
    const { policySetName } = args;
    const perPage = 100;
    let page = 1;
    let total = 0;
    const items: Exception[] = [];

    do {
      const result = await this.getExceptions({ page, perPage });
      total = result.total;
      items.push(
        ...result.items.filter(exception =>
          exception.policySets.includes(policySetName)
        )
      );
      page += 1;
    } while ((page - 1) * perPage < total);

    return items;
  }

  /**
   * Resolves full rule records for each rule name targeted by this exception
   * (same names as {@link Exception.rules} / the exception channel query).
   */
  public async getExceptionRules(args: { name: string }): Promise<Rule[]> {
    const exception = await this.getException(args);
    if (exception.rules.length === 0) {
      return [];
    }
    const pages = await Promise.all(
      exception.rules.map(ruleName => this.getRule({ name: ruleName }))
    );
    return pages;
  }

  /**
   * Loads {@link PolicySet} details for each policy set this exception is wired into
   * (same names as {@link Exception.policySets}).
   */
  public async getExceptionPolicySets(args: {
    name: string;
  }): Promise<PolicySet[]> {
    const exception = await this.getException(args);
    if (exception.policySets.length === 0) {
      return [];
    }
    return Promise.all(
      exception.policySets.map(policySetName =>
        this.getPolicySet(policySetName)
      )
    );
  }
}

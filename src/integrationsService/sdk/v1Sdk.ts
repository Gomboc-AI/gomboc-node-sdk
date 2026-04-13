import axios, { type AxiosInstance } from 'axios';
import { err, ok, type Result } from 'neverthrow';

import type { ILogger } from '../../rulesService/ILogger';
import type {
  CreateHcpIntegrationRequestBody,
  CreateHcpIntegrationResponse,
  CreateOrlFixAppliedEventRequestBody,
  CreateOrlFixAppliedEventResponse,
  CreateOrlReportEventRequestBody,
  CreateOrlReportEventResponse,
  DeleteHcpIntegrationParams,
  DeleteHcpIntegrationResponse,
  GetAllHcpIntegrationsResponse,
  GetDriftTerraformPlanParams,
  GetDriftTerraformPlanResponse,
  GetHcpIntegrationParams,
  GetHcpIntegrationResponse,
  GetHealthcheckResponse,
  IIntegrationsServiceErrorType,
  IIntegrationsServiceSdk,
  NotificationWebhookRequestBody,
  NotificationWebhookResponse,
  NotificationWebhookParams,
  AccountId,
  TerraformRunTaskWebhookParams,
  TerraformRunTaskWebhookRequestBody,
  TerraformRunTaskWebhookResponse,
} from './types';

type ApiSuccess<T> = { status: 'success'; data: T };
type ApiError = { status: 'error'; error: IIntegrationsServiceErrorType };

/** Low-level typed client for integrations service endpoints. */
export class IntegrationsServiceSdk implements IIntegrationsServiceSdk {
  private client: AxiosInstance;
  private logger: ILogger;

  private constructor(args: {
    accessToken: string;
    accountId: AccountId;
    baseUrl: string;
    logger: ILogger;
  }) {
    const { accessToken, accountId, baseUrl, logger } = args;
    this.logger = logger;
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'x-organization-id': accountId,
      },
    });
  }

  static init(args: {
    accessToken: string;
    accountId: AccountId;
    baseUrl: string;
    logger: ILogger;
  }): IntegrationsServiceSdk {
    return new IntegrationsServiceSdk(args);
  }

  private async request<T>(
    fn: () => Promise<ApiSuccess<T> | ApiError>
  ): Promise<Result<T, IIntegrationsServiceErrorType>> {
    try {
      const body = await fn();
      if (body.status === 'success') return ok(body.data);
      return err(body.error);
    } catch (e) {
      const errBody =
        axios.isAxiosError(e) && e.response?.data
          ? (e.response.data as ApiError)
          : null;
      const error: IIntegrationsServiceErrorType = errBody?.error ?? {
        message: e instanceof Error ? e.message : 'Unknown error',
      };
      this.logger.error('IntegrationsServiceSdk request failed', error);
      return err(error);
    }
  }

  async getHealthcheck(): Promise<
    Result<GetHealthcheckResponse, IIntegrationsServiceErrorType>
  > {
    return this.request<GetHealthcheckResponse>(async () => {
      const res = await this.client.get('/healthcheck');
      return res.data;
    });
  }

  async getHcpIntegration(
    args: GetHcpIntegrationParams
  ): Promise<Result<GetHcpIntegrationResponse, IIntegrationsServiceErrorType>> {
    return this.request<GetHcpIntegrationResponse>(async () => {
      const res = await this.client.get(
        `/tf-ops/api/v1/hcp/integrations/${args.integrationId}`
      );
      return res.data;
    });
  }

  async deleteHcpIntegration(
    args: DeleteHcpIntegrationParams
  ): Promise<
    Result<DeleteHcpIntegrationResponse, IIntegrationsServiceErrorType>
  > {
    return this.request<DeleteHcpIntegrationResponse>(async () => {
      const res = await this.client.delete(
        `/tf-ops/api/v1/hcp/integrations/${args.integrationId}`
      );
      return res.data;
    });
  }

  async getAllHcpIntegrations(): Promise<
    Result<GetAllHcpIntegrationsResponse, IIntegrationsServiceErrorType>
  > {
    return this.request<GetAllHcpIntegrationsResponse>(async () => {
      const res = await this.client.get('/tf-ops/api/v1/hcp/integrations');
      return res.data;
    });
  }

  async createHcpIntegration(
    args: CreateHcpIntegrationRequestBody
  ): Promise<
    Result<CreateHcpIntegrationResponse, IIntegrationsServiceErrorType>
  > {
    return this.request<CreateHcpIntegrationResponse>(async () => {
      const res = await this.client.post('/tf-ops/api/v1/hcp/integrations', args);
      return res.data;
    });
  }

  async postTerraformRunTaskWebhook(args: {
    params: TerraformRunTaskWebhookParams;
    body: TerraformRunTaskWebhookRequestBody;
  }): Promise<
    Result<TerraformRunTaskWebhookResponse, IIntegrationsServiceErrorType>
  > {
    return this.request<TerraformRunTaskWebhookResponse>(async () => {
      const res = await this.client.post(
        `/tf-ops/api/v1/hcp/webhooks/terraform-run-task/${args.params.integrationId}`,
        args.body
      );
      return res.data;
    });
  }

  async postNotificationWebhook(args: {
    params: NotificationWebhookParams;
    body: NotificationWebhookRequestBody;
  }): Promise<Result<NotificationWebhookResponse, IIntegrationsServiceErrorType>> {
    return this.request<NotificationWebhookResponse>(async () => {
      const res = await this.client.post(
        `/tf-ops/api/v1/hcp/webhooks/notifications/${args.params.integrationId}`,
        args.body
      );
      return res.data;
    });
  }

  async getDriftTerraformPlan(
    args: GetDriftTerraformPlanParams
  ): Promise<
    Result<GetDriftTerraformPlanResponse, IIntegrationsServiceErrorType>
  > {
    return this.request<GetDriftTerraformPlanResponse>(async () => {
      const res = await this.client.get(
        `/tf-ops/api/v1/hcp/drift/terraform-plan/${args.driftNotificationId}`
      );
      return res.data;
    });
  }

  async createOrlReportEvent(
    args: CreateOrlReportEventRequestBody
  ): Promise<
    Result<CreateOrlReportEventResponse, IIntegrationsServiceErrorType>
  > {
    return this.request<CreateOrlReportEventResponse>(async () => {
      const res = await this.client.post('/reporting/orl-external', args);
      return res.data;
    });
  }

  async createOrlFixAppliedEvent(
    args: CreateOrlFixAppliedEventRequestBody
  ): Promise<
    Result<CreateOrlFixAppliedEventResponse, IIntegrationsServiceErrorType>
  > {
    return this.request<CreateOrlFixAppliedEventResponse>(async () => {
      const res = await this.client.post('/reporting/orl-fix-applied', args);
      return res.data;
    });
  }
}

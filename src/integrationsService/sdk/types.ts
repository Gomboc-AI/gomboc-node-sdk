import type { Result } from 'neverthrow';
import type {
  components,
  operations,
} from '../../__generated__/integrationsService.js';

type Schemas = components['schemas'];

/** OpenAPI error body; optional fields reflect HTTP/client layers (e.g. axios status). */
export type IIntegrationsServiceErrorType =
  Schemas['GetHealthcheckNegativeResponse']['error'] & {
    code?: string;
    statusCode?: number;
  };

export type AccountId =
  operations['getAllHcpIntegrations']['parameters']['header']['x-organization-id'];

export type GetHealthcheckResponse =
  Schemas['GetHealthcheckPositiveResponse']['data'];

export type GetHcpIntegrationParams =
  operations['getHcpIntegration']['parameters']['path'];
export type GetHcpIntegrationResponse =
  Schemas['GetTfOpsApiV1HcpIntegrationsIntegrationIdPositiveResponse']['data'];

export type DeleteHcpIntegrationParams =
  operations['deleteHcpIntegration']['parameters']['path'];
export type DeleteHcpIntegrationResponse =
  Schemas['DeleteTfOpsApiV1HcpIntegrationsIntegrationIdPositiveResponse']['data'];

export type GetAllHcpIntegrationsResponse =
  Schemas['GetTfOpsApiV1HcpIntegrationsPositiveResponse']['data'];

export type CreateHcpIntegrationRequestBody =
  Schemas['PostTfOpsApiV1HcpIntegrationsRequestBody'];
export type CreateHcpIntegrationResponse =
  Schemas['PostTfOpsApiV1HcpIntegrationsPositiveResponse']['data'];

export type TerraformRunTaskWebhookParams =
  operations['PostTfOpsApiV1HcpWebhooksTerraformRunTaskIntegrationId']['parameters']['path'];
export type TerraformRunTaskWebhookRequestBody =
  Schemas['PostTfOpsApiV1HcpWebhooksTerraformRunTaskIntegrationIdRequestBody'];
export type TerraformRunTaskWebhookResponse =
  Schemas['PostTfOpsApiV1HcpWebhooksTerraformRunTaskIntegrationIdPositiveResponse']['data'];

export type NotificationWebhookParams =
  operations['PostTfOpsApiV1HcpWebhooksNotificationsIntegrationId']['parameters']['path'];
export type NotificationWebhookRequestBody =
  Schemas['PostTfOpsApiV1HcpWebhooksNotificationsIntegrationIdRequestBody'];
export type NotificationWebhookResponse =
  Schemas['PostTfOpsApiV1HcpWebhooksNotificationsIntegrationIdPositiveResponse']['data'];

export type GetDriftTerraformPlanParams =
  operations['GetTfOpsApiV1HcpDriftTerraformPlanDriftNotificationId']['parameters']['path'];
export type GetDriftTerraformPlanResponse =
  Schemas['GetTfOpsApiV1HcpDriftTerraformPlanDriftNotificationIdPositiveResponse']['data'];

export type CreateOrlReportEventRequestBody =
  Schemas['PostReportingOrlExternalRequestBody'];
export type CreateOrlReportEventResponse =
  Schemas['PostReportingOrlExternalPositiveResponse']['data'];

export type CreateOrlFixAppliedEventRequestBody =
  Schemas['PostReportingOrlFixAppliedRequestBody'];
export type CreateOrlFixAppliedEventResponse =
  Schemas['PostReportingOrlFixAppliedPositiveResponse']['data'];

export interface IIntegrationsServiceSdk {
  getHealthcheck(): Promise<
    Result<GetHealthcheckResponse, IIntegrationsServiceErrorType>
  >;
  getHcpIntegration(
    args: GetHcpIntegrationParams
  ): Promise<Result<GetHcpIntegrationResponse, IIntegrationsServiceErrorType>>;
  deleteHcpIntegration(
    args: DeleteHcpIntegrationParams
  ): Promise<
    Result<DeleteHcpIntegrationResponse, IIntegrationsServiceErrorType>
  >;
  getAllHcpIntegrations(): Promise<
    Result<GetAllHcpIntegrationsResponse, IIntegrationsServiceErrorType>
  >;
  createHcpIntegration(
    args: CreateHcpIntegrationRequestBody
  ): Promise<
    Result<CreateHcpIntegrationResponse, IIntegrationsServiceErrorType>
  >;
  postTerraformRunTaskWebhook(args: {
    params: TerraformRunTaskWebhookParams;
    body: TerraformRunTaskWebhookRequestBody;
  }): Promise<
    Result<TerraformRunTaskWebhookResponse, IIntegrationsServiceErrorType>
  >;
  postNotificationWebhook(args: {
    params: NotificationWebhookParams;
    body: NotificationWebhookRequestBody;
  }): Promise<
    Result<NotificationWebhookResponse, IIntegrationsServiceErrorType>
  >;
  getDriftTerraformPlan(
    args: GetDriftTerraformPlanParams
  ): Promise<
    Result<GetDriftTerraformPlanResponse, IIntegrationsServiceErrorType>
  >;
  createOrlReportEvent(
    args: CreateOrlReportEventRequestBody
  ): Promise<
    Result<CreateOrlReportEventResponse, IIntegrationsServiceErrorType>
  >;
  createOrlFixAppliedEvent(
    args: CreateOrlFixAppliedEventRequestBody
  ): Promise<
    Result<CreateOrlFixAppliedEventResponse, IIntegrationsServiceErrorType>
  >;
}

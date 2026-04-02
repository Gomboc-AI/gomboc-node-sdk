import type { Channel, Rule as RuleSdk } from '../sdk/types';

export type PolicyAnnotations = { [key: string]: unknown } | null | undefined;

/**
 * Policy represents a high-level policy concept, abstracting away
 * internal implementation details like classifications.
 */
export interface Policy {
  /** Unique identifier for the policy */
  id: string;
  /** Display name for the policy */
  name: string;
  /** Optional description of the policy */
  description?: string | null;
  /** Optional annotations/metadata for the policy (tags, categories, etc.) */
  annotations?: PolicyAnnotations;
}

export interface PolicySet extends Channel {
  description?: string;
  createdBy: string;
  isDefault: boolean;
  appliedWorkspaceChannelNames?: string[];
  appliedWorkspaceIds?: string[];
  policiesCount: number;
  /** Number of exceptions that include this policy set in their wiring. */
  exceptionsCount: number;
  isAppliedToAllWorkspaces: boolean;

  updatedBy: string;
  updatedAt: string;
}

export interface PolicySetPage {
  total: number;
  page: number;
  perPage: number;
  items: PolicySet[];
}

export type Rule = RuleSdk; // Re export as is

export type CreatePolicySetArgs = {
  name: string;
  createdBy: string;
  applyToAllWorkspaces: boolean;
  query?: string;
  description?: string;
  workspaceIds?: string[];
  annotations?: {
    [key: string]: unknown;
  };
};

export type UpdatePolicySetArgs = {
  name: string;
  updatedBy: string;
  applyToAllWorkspaces?: boolean;
  policyNames?: string[];
  description?: string;
  workspaceIds?: string[];
  frameworkNames?: string[];
  annotations?: {
    [key: string]: unknown;
  };
};

export type Framework = {
  name: string;
  shortName?: string | null;
  description?: string | null;
  annotations?: Record<string, any>;
};

export type CreateExceptionArgs = {
  name: string;
  rules: string[];
  policySets: string[];
  createdBy: string;
  description: string;
};

export type DeleteExceptionArgs = {
  name: string;
};

/** Mutable state shared by deleteException saga steps (forward + compensate). */
export type DeleteExceptionSagaContext = {
  policySetStepState: Record<
    string,
    {
      channelName: string;
      snapshot: Channel | null;
      didUpdate: boolean;
    }
  >;
};

/**
 * One exception channel: many rules (matched via `query`, mirrored in `rules`) and many
 * policy sets (`policySets`) that include this channel in their filters.
 */
export interface Exception extends Channel {
  /** Short label — same segment as {@link CreateExceptionArgs.name}. */
  name: string;
  /** Rule names this exception targets (same as {@link CreateExceptionArgs.rules}). */
  rules: string[];
  createdBy: string;
  description?: string;
  /** Policy sets this exception is wired into (same as {@link CreateExceptionArgs.policySets}). */
  policySets: string[];
  createdAt: string;
  updatedAt: string;
}

export type ExceptionPage = {
  total: number;
  page: number;
  perPage: number;
  items: Exception[];
};

/** Mutable state shared by createException saga steps (forward + compensate). */
export type CreateExceptionSagaContext = {
  exceptionChannelCreated: boolean;
  policySetStepState: Record<
    string,
    {
      channelName: string;
      snapshot: Channel | null;
      didUpdate: boolean;
    }
  >;
};

export type SagaRollbackStatus = 'completed' | 'partial';

export type SagaCompensationFailurePayload = {
  step: string;
  message: string;
};

export type SagaRollbackErrorPayload = {
  type: 'SAGA_ROLLBACK_ERROR';
  message: string;
  failedStep: string;
  rollbackStatus: SagaRollbackStatus;
  compensationFailures: SagaCompensationFailurePayload[];
  correlationId: string;
  originalError: {
    message: string;
    code?: string;
    statusCode?: number;
  };
};

export class SagaRollbackError extends Error {
  public readonly type = 'SAGA_ROLLBACK_ERROR';
  public readonly failedStep: string;
  public readonly rollbackStatus: SagaRollbackStatus;
  public readonly compensationFailures: SagaCompensationFailurePayload[];
  public readonly correlationId: string;
  public readonly originalError: {
    message: string;
    code?: string;
    statusCode?: number;
  };

  constructor(payload: Omit<SagaRollbackErrorPayload, 'type'>) {
    super(payload.message);
    this.name = 'SagaRollbackError';
    this.failedStep = payload.failedStep;
    this.rollbackStatus = payload.rollbackStatus;
    this.compensationFailures = payload.compensationFailures;
    this.correlationId = payload.correlationId;
    this.originalError = payload.originalError;
  }

  public toJSON(): SagaRollbackErrorPayload {
    return {
      type: this.type,
      message: this.message,
      failedStep: this.failedStep,
      rollbackStatus: this.rollbackStatus,
      compensationFailures: this.compensationFailures,
      correlationId: this.correlationId,
      originalError: this.originalError,
    };
  }
}

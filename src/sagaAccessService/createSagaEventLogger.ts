import type { SagaEvent } from './runSaga';

/** Minimal logger surface so callers are not tied to a specific logging package. */
export type SagaAccessLogger = {
  debug: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
};

type LoggerLike = {
  debug: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
};

/** Adapts a typical app logger (variadic args) to {@link SagaAccessLogger}. */
export function toSagaAccessLogger(logger: LoggerLike): SagaAccessLogger {
  return {
    debug: (message, meta) => logger.debug(message, meta),
    error: (message, meta) => logger.error(message, meta),
  };
}

export type CreateSagaEventLoggerOptions = {
  logger: SagaAccessLogger;
  /** e.g. `RulesService`, `BillingService` */
  namespace: string;
  /** e.g. `createException`, `provisionWorkspace` */
  operation: string;
  /** Merged into every log payload (correlation ids, resource keys, etc.). */
  context?: Record<string, unknown>;
};

/**
 * Builds an `onEvent` handler for {@link runSaga} with consistent message prefixes
 * (`namespace.operation: saga …`) and optional static context on every line.
 */
export function createSagaEventLogger(
  options: CreateSagaEventLoggerOptions
): (event: SagaEvent) => void {
  const { logger, namespace, operation, context = {} } = options;
  const prefix = `${namespace}.${operation}`;

  return (event: SagaEvent) => {
    const base: Record<string, unknown> = { step: event.stepName, ...context };

    switch (event.type) {
      case 'step_start':
        logger.debug(`${prefix}: saga step start`, base);
        break;
      case 'step_success':
        logger.debug(`${prefix}: saga step success`, base);
        break;
      case 'step_failure':
        logger.error(`${prefix}: saga step failure`, {
          ...base,
          error: event.error,
        });
        break;
      case 'compensation_start':
        logger.debug(`${prefix}: saga compensation start`, base);
        break;
      case 'compensation_success':
        logger.debug(`${prefix}: saga compensation success`, base);
        break;
      case 'compensation_failure':
        logger.error(`${prefix}: saga compensation failure`, {
          ...base,
          error: event.error,
        });
        break;
      default: {
        const _exhaustive: never = event;
        void _exhaustive;
        break;
      }
    }
  };
}

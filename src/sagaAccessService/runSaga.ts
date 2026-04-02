/**
 * Minimal in-process Saga orchestrator.
 *
 * Steps are executed in order. If any step fails, previously completed steps
 * are compensated in reverse order (best effort), and a SagaExecutionError is
 * thrown with both the original failure and any compensation failures.
 */
export type SagaStep = {
  name: string;
  execute: () => Promise<void>;
  compensate?: () => Promise<void>;
};

export type SagaEvent =
  | { type: 'step_start'; stepName: string }
  | { type: 'step_success'; stepName: string }
  | { type: 'step_failure'; stepName: string; error: unknown }
  | { type: 'compensation_start'; stepName: string }
  | { type: 'compensation_success'; stepName: string }
  | { type: 'compensation_failure'; stepName: string; error: unknown };

export type SagaCompensationFailure = {
  step: string;
  error: unknown;
};

export class SagaExecutionError extends Error {
  public readonly failedStep: string;
  public readonly originalError: unknown;
  public readonly compensationFailures: SagaCompensationFailure[];

  constructor(args: {
    failedStep: string;
    originalError: unknown;
    compensationFailures: SagaCompensationFailure[];
  }) {
    super(`Saga failed at step "${args.failedStep}"`);
    this.name = 'SagaExecutionError';
    this.failedStep = args.failedStep;
    this.originalError = args.originalError;
    this.compensationFailures = args.compensationFailures;
  }
}

/** `onEvent` is optional so callers can omit it when they only need success vs thrown `SagaExecutionError`. */
export async function runSaga(
  steps: SagaStep[],
  onEvent?: (event: SagaEvent) => void,
) {
  const completedSteps: SagaStep[] = [];

  for (const step of steps) {
    try {
      onEvent?.({ type: 'step_start', stepName: step.name });
      await step.execute();
      completedSteps.push(step);
      onEvent?.({ type: 'step_success', stepName: step.name });
    } catch (error) {
      onEvent?.({ type: 'step_failure', stepName: step.name, error });
      const compensationFailures: SagaCompensationFailure[] = [];

      for (let i = completedSteps.length - 1; i >= 0; i--) {
        const completedStep = completedSteps[i];
        if (!completedStep.compensate) {
          continue;
        }

        try {
          onEvent?.({
            type: 'compensation_start',
            stepName: completedStep.name,
          });
          await completedStep.compensate();
          onEvent?.({
            type: 'compensation_success',
            stepName: completedStep.name,
          });
        } catch (compensationError) {
          onEvent?.({
            type: 'compensation_failure',
            stepName: completedStep.name,
            error: compensationError,
          });
          compensationFailures.push({
            step: completedStep.name,
            error: compensationError,
          });
        }
      }

      throw new SagaExecutionError({
        failedStep: step.name,
        originalError: error,
        compensationFailures,
      });
    }
  }
}

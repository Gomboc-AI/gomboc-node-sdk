import { createSagaEventLogger } from './createSagaEventLogger';
import { SagaEvent } from './runSaga';

function makeLogger() {
  return {
    debug: jest.fn(),
    error: jest.fn(),
  };
}

describe('createSagaEventLogger', () => {
  it('prefixes messages with namespace.operation and includes context', () => {
    const logger = makeLogger();
    const onEvent = createSagaEventLogger({
      logger,
      namespace: 'RulesService',
      operation: 'createException',
      context: { exceptionChannelName: 'acct/exc/1' },
    });

    const ev: SagaEvent = {
      type: 'step_start',
      stepName: 'create_exception_channel',
    };
    onEvent(ev);

    expect(logger.debug).toHaveBeenCalledWith(
      'RulesService.createException: saga step start',
      {
        step: 'create_exception_channel',
        exceptionChannelName: 'acct/exc/1',
      }
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs step_failure with error', () => {
    const logger = makeLogger();
    const onEvent = createSagaEventLogger({
      logger,
      namespace: 'Svc',
      operation: 'op',
    });
    const boom = new Error('fail');
    onEvent({ type: 'step_failure', stepName: 's1', error: boom });

    expect(logger.error).toHaveBeenCalledWith('Svc.op: saga step failure', {
      step: 's1',
      error: boom,
    });
  });

  it('logs compensation_failure with error', () => {
    const logger = makeLogger();
    const onEvent = createSagaEventLogger({
      logger,
      namespace: 'Svc',
      operation: 'op',
    });
    const err = new Error('comp');
    onEvent({ type: 'compensation_failure', stepName: 's1', error: err });

    expect(logger.error).toHaveBeenCalledWith(
      'Svc.op: saga compensation failure',
      {
        step: 's1',
        error: err,
      }
    );
  });

  it('handles empty context', () => {
    const logger = makeLogger();
    const onEvent = createSagaEventLogger({
      logger,
      namespace: 'A',
      operation: 'b',
    });
    onEvent({ type: 'step_success', stepName: 'x' });
    expect(logger.debug).toHaveBeenCalledWith('A.b: saga step success', {
      step: 'x',
    });
  });
});

import {
  runSaga,
  SagaExecutionError,
  type SagaEvent,
  type SagaStep,
} from './runSaga';

describe('runSaga', () => {
  it('runs steps in order and emits start/success for each', async () => {
    const events: string[] = [];
    const steps: SagaStep[] = [
      {
        name: 'a',
        execute: async () => {
          events.push('exec-a');
        },
      },
      {
        name: 'b',
        execute: async () => {
          events.push('exec-b');
        },
      },
    ];

    await runSaga(steps, (ev: SagaEvent) => {
      events.push(`${ev.type}:${ev.stepName}`);
    });

    expect(events).toEqual([
      'step_start:a',
      'exec-a',
      'step_success:a',
      'step_start:b',
      'exec-b',
      'step_success:b',
    ]);
  });

  it('compensates completed steps in reverse order when a step fails', async () => {
    const log: string[] = [];
    const steps: SagaStep[] = [
      {
        name: 's1',
        execute: async () => {
          log.push('e1');
        },
        compensate: async () => {
          log.push('c1');
        },
      },
      {
        name: 's2',
        execute: async () => {
          log.push('e2');
        },
        compensate: async () => {
          log.push('c2');
        },
      },
      {
        name: 's3',
        execute: async () => {
          log.push('e3-fail');
          throw new Error('boom');
        },
      },
    ];

    await expect(runSaga(steps)).rejects.toThrow(SagaExecutionError);

    expect(log).toEqual(['e1', 'e2', 'e3-fail', 'c2', 'c1']);
  });

  it('throws SagaExecutionError with failedStep and originalError', async () => {
    const err = new Error('nope');
    const steps: SagaStep[] = [
      {
        name: 'only',
        execute: async () => {
          throw err;
        },
      },
    ];

    let thrown: unknown;
    try {
      await runSaga(steps);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(SagaExecutionError);
    const sagaErr = thrown as SagaExecutionError;
    expect(sagaErr.failedStep).toBe('only');
    expect(sagaErr.originalError).toBe(err);
    expect(sagaErr.compensationFailures).toEqual([]);
  });

  it('records compensation failures on SagaExecutionError', async () => {
    const compFail = new Error('comp failed');
    const steps: SagaStep[] = [
      {
        name: 'ok',
        execute: async () => {},
        compensate: async () => {
          throw compFail;
        },
      },
      {
        name: 'bad',
        execute: async () => {
          throw new Error('forward');
        },
      },
    ];

    let thrown: unknown;
    try {
      await runSaga(steps);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(SagaExecutionError);
    const sagaErr = thrown as SagaExecutionError;
    expect(sagaErr.compensationFailures).toHaveLength(1);
    expect(sagaErr.compensationFailures[0]?.step).toBe('ok');
    expect(sagaErr.compensationFailures[0]?.error).toBe(compFail);
  });

  it('skips compensate when step has no compensate function', async () => {
    const log: string[] = [];
    const steps: SagaStep[] = [
      {
        name: 'no-comp',
        execute: async () => {
          log.push('e1');
        },
      },
      {
        name: 'fail',
        execute: async () => {
          throw new Error('x');
        },
      },
    ];

    await expect(runSaga(steps)).rejects.toThrow(SagaExecutionError);
    expect(log).toEqual(['e1']);
  });
});

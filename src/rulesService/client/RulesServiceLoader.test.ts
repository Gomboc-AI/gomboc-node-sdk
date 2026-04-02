jest.mock('../sdk/v1Sdk', () => ({
  RulesServiceSdk: {
    init: jest.fn(() => ({})),
  },
}));

import type {
  BatchUpsertChannelsRequestParams,
  Classification,
} from '../sdk/types';
import { RulesServiceError } from '../sdk/RulesServiceError';
import { RulesServiceLoader } from './rulesServiceLoader';
import type { Exception, Policy, PolicySet } from './types';
import { SagaRollbackError } from './types';
import { err, ok } from 'neverthrow';

function makeChannel(name: string, filters: string[] = []) {
  return {
    accountId: 'acct-1',
    name,
    query: '(or (contains "policy.a" finding.classification))',
    filters,
    annotations: { 'gomboc-ai/type': 'policy-set' } as Record<string, unknown>,
    id: `id-${name}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeExceptionChannelRecord(
  overrides: {
    name?: string;
    query?: string;
    filters?: string[];
    annotations?: Record<string, unknown>;
    id?: string;
  } = {}
) {
  return {
    accountId: 'acct-1',
    name: 'acct-1/exception/EX-1',
    query: '(or (eq $.name "gomboc-ai/rule-a"))',
    filters: [] as string[],
    annotations: {
      'gomboc-ai/created-by': 'user-1',
      'gomboc-ai/rules': ['gomboc-ai/rule-a'],
      'gomboc-ai/policy-sets': ['default', 'platform'],
      'gomboc-ai/description': 'desc',
    },
    id: 'exc-id',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeMinimalException(
  overrides: Pick<Exception, 'name' | 'rules' | 'policySets' | 'createdBy'> &
    Partial<Exception>
): Exception {
  const base = makeExceptionChannelRecord({
    name: `acct-1/exception/${overrides.name}`,
  });
  return {
    ...base,
    ...overrides,
    name: overrides.name,
    rules: overrides.rules,
    policySets: overrides.policySets,
    createdBy: overrides.createdBy,
    createdAt: String(base.createdAt),
    updatedAt: String(base.updatedAt),
  };
}

function makeMinimalPolicySet(
  shortName: string,
  id: string,
  extra: Partial<PolicySet> = {}
): PolicySet {
  const ch = makeChannel(`acct-1/set/${shortName}`);
  return {
    ...ch,
    name: shortName,
    id,
    createdBy: 'u',
    isDefault: false,
    policiesCount: 0,
    exceptionsCount: 0,
    isAppliedToAllWorkspaces: true,
    updatedBy: '',
    updatedAt: String(ch.updatedAt),
    ...extra,
  };
}

function makeMinimalLinkedException(shortName: string): Exception {
  return makeMinimalException({
    name: shortName,
    rules: [],
    policySets: ['default'],
    createdBy: 'u',
  });
}

function buildLogger() {
  return {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
}

type TestLogger = ReturnType<typeof buildLogger>;

type TestLoader = Omit<RulesServiceLoader, never> & {
  client: Record<string, unknown>;
};

function buildLoader(): { loader: TestLoader; logger: TestLogger } {
  const logger = buildLogger();
  const LoaderCtor = RulesServiceLoader as unknown as new (args: {
    accountId: string;
    accessToken: string;
    baseUrl: string;
    logger: TestLogger;
  }) => RulesServiceLoader;
  const loader = new LoaderCtor({
    accountId: 'acct-1',
    accessToken: 'token',
    baseUrl: 'https://rules.test',
    logger,
  }) as unknown as TestLoader;
  return { loader, logger };
}

describe('RulesServiceLoader', () => {
  describe('createException', () => {
    it('creates exception channel and appends its name to each policy set filters', async () => {
      const { loader } = buildLoader();
      const exceptionName = 'EX-001';
      const exceptionChannelName = `acct-1/exception/${exceptionName}`;
      const policySet1 = makeChannel('acct-1/set/default');
      const policySet2 = makeChannel('acct-1/set/platform', [
        'existing-filter',
      ]);

      loader.client = {
        createChannel: jest.fn().mockResolvedValue(ok({})),
        updateChannel: jest.fn().mockResolvedValue(ok({})),
        deleteChannel: jest.fn().mockResolvedValue(ok({ success: true })),
        getChannel: jest
          .fn()
          .mockResolvedValueOnce(ok(policySet1))
          .mockResolvedValueOnce(ok(policySet2)),
      };

      await loader.createException({
        name: exceptionName,
        rules: ['gomboc-ai/policy/a'],
        policySets: ['default', 'platform'],
        createdBy: 'user-1',
        description: 'desc',
      });

      expect(loader.client.createChannel).toHaveBeenCalledWith(
        expect.objectContaining({
          name: exceptionChannelName,
          query: '(or (eq $.name "gomboc-ai/policy/a"))',
          annotations: expect.objectContaining({
            'gomboc-ai/created-at': expect.any(String),
            'gomboc-ai/created-by': 'user-1',
            'gomboc-ai/description': 'desc',
            'gomboc-ai/rules': ['gomboc-ai/policy/a'],
            'gomboc-ai/policy-sets': ['default', 'platform'],
          }),
        })
      );
      const exceptionFilter = `(channel "${exceptionChannelName}" true)`;
      expect(loader.client.updateChannel).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          name: 'acct-1/set/default',
          query: policySet1.query,
          filters: [exceptionFilter],
        })
      );
      expect(loader.client.updateChannel).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          name: 'acct-1/set/platform',
          query: policySet2.query,
          filters: ['existing-filter', exceptionFilter],
        })
      );
    });

    it('builds a combined or-query when multiple rules are provided', async () => {
      const { loader } = buildLoader();
      const policySet = makeChannel('acct-1/set/default');

      loader.client = {
        createChannel: jest.fn().mockResolvedValue(ok({})),
        updateChannel: jest.fn().mockResolvedValue(ok({})),
        deleteChannel: jest.fn().mockResolvedValue(ok({ success: true })),
        getChannel: jest.fn().mockResolvedValue(ok(policySet)),
      };

      await loader.createException({
        name: 'EX-multi',
        rules: ['gomboc-ai/policy/a', 'gomboc-ai/policy/b'],
        policySets: ['default'],
        createdBy: 'user-1',
        description: 'multi',
      });

      expect(loader.client.createChannel).toHaveBeenCalledWith(
        expect.objectContaining({
          query:
            '(or (eq $.name "gomboc-ai/policy/a") (eq $.name "gomboc-ai/policy/b"))',
          annotations: expect.objectContaining({
            'gomboc-ai/rules': ['gomboc-ai/policy/a', 'gomboc-ai/policy/b'],
            'gomboc-ai/policy-sets': ['default'],
          }),
        })
      );
    });

    it('uses empty query when rules array is empty', async () => {
      const { loader } = buildLoader();
      const exceptionChannelName = 'acct-1/exception/EX-empty';
      const policySet = makeChannel('acct-1/set/default');

      loader.client = {
        createChannel: jest.fn().mockResolvedValue(ok({})),
        updateChannel: jest.fn().mockResolvedValue(ok({})),
        deleteChannel: jest.fn().mockResolvedValue(ok({ success: true })),
        getChannel: jest.fn().mockResolvedValue(ok(policySet)),
      };

      await loader.createException({
        name: 'EX-empty',
        rules: [],
        policySets: ['default'],
        createdBy: 'u',
        description: 'd',
      });

      expect(loader.client.createChannel).toHaveBeenCalledWith(
        expect.objectContaining({
          name: exceptionChannelName,
          query: '',
          annotations: expect.objectContaining({
            'gomboc-ai/rules': [],
            'gomboc-ai/policy-sets': ['default'],
          }),
        })
      );
    });

    it('rolls back policy sets and deletes exception channel when a policy set update fails', async () => {
      const { loader } = buildLoader();
      const exceptionChannelName = 'acct-1/exception/EX-002';
      const policySet1 = makeChannel('acct-1/set/default');
      const policySet2 = makeChannel('acct-1/set/platform');
      const updateError = new RulesServiceError(
        'update failed',
        'UPD_FAIL',
        500
      );

      loader.client = {
        createChannel: jest.fn().mockResolvedValue(ok({})),
        updateChannel: jest
          .fn()
          .mockResolvedValueOnce(ok({}))
          .mockResolvedValueOnce(err(updateError))
          .mockResolvedValueOnce(ok({})),
        deleteChannel: jest.fn().mockResolvedValue(ok({ success: true })),
        getChannel: jest
          .fn()
          .mockResolvedValueOnce(ok(policySet1))
          .mockResolvedValueOnce(ok(policySet2)),
      };

      let thrown: unknown;
      try {
        await loader.createException({
          name: 'EX-002',
          rules: ['gomboc-ai/policy/a'],
          policySets: ['default', 'platform'],
          createdBy: 'user-1',
          description: 'desc',
        });
        throw new Error('Expected createException to throw');
      } catch (e) {
        thrown = e;
      }

      expect(thrown).toBeInstanceOf(SagaRollbackError);
      const sagaError = thrown as SagaRollbackError;
      expect(sagaError.rollbackStatus).toBe('completed');
      expect(sagaError.failedStep).toBe(
        'attach_exception_filter_to_policy_set:platform'
      );
      expect(sagaError.correlationId).toBe(exceptionChannelName);
      expect(sagaError.compensationFailures).toEqual([]);
      expect(sagaError.originalError.message).toBe('update failed');
      // extractErrorInfo only fills code/statusCode for Axios errors today
      expect(sagaError.originalError.code).toBeUndefined();
      expect(sagaError.originalError.statusCode).toBeUndefined();

      expect(loader.client.updateChannel).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({
          name: 'acct-1/set/default',
          filters: [],
        })
      );
      expect(loader.client.deleteChannel).toHaveBeenCalledWith({
        name: exceptionChannelName,
      });
    });

    it('reports partial rollback when compensation fails', async () => {
      const { loader } = buildLoader();
      const policySet1 = makeChannel('acct-1/set/default');
      const policySet2 = makeChannel('acct-1/set/platform');
      const updateError = {
        message: 'update failed',
        code: 'UPD_FAIL',
        statusCode: 500,
      };

      loader.client = {
        createChannel: jest.fn().mockResolvedValue(ok({})),
        updateChannel: jest
          .fn()
          .mockResolvedValueOnce(ok({}))
          .mockResolvedValueOnce(err(updateError))
          .mockResolvedValueOnce(ok({})),
        deleteChannel: jest
          .fn()
          .mockResolvedValue(err({ message: 'delete failed' })),
        getChannel: jest
          .fn()
          .mockResolvedValueOnce(ok(policySet1))
          .mockResolvedValueOnce(ok(policySet2)),
      };

      let thrown: unknown;
      try {
        await loader.createException({
          name: 'EX-003',
          rules: ['gomboc-ai/policy/a'],
          policySets: ['default', 'platform'],
          createdBy: 'user-1',
          description: 'desc',
        });
        throw new Error('Expected createException to throw');
      } catch (e) {
        thrown = e;
      }

      expect(thrown).toBeInstanceOf(SagaRollbackError);
      const sagaError = thrown as SagaRollbackError;
      expect(sagaError.rollbackStatus).toBe('partial');
      expect(sagaError.compensationFailures[0]?.step).toBe(
        'create_exception_channel'
      );
    });

    it('does not call updateChannel when exception filter is already present', async () => {
      const { loader } = buildLoader();
      const exceptionChannelName = 'acct-1/exception/EX-004';
      const exceptionFilter = `(channel "${exceptionChannelName}" true)`;
      const policySet = makeChannel('acct-1/set/default', [exceptionFilter]);

      loader.client = {
        createChannel: jest.fn().mockResolvedValue(ok({})),
        updateChannel: jest.fn().mockResolvedValue(ok({})),
        deleteChannel: jest.fn().mockResolvedValue(ok({ success: true })),
        getChannel: jest.fn().mockResolvedValue(ok(policySet)),
      };

      await loader.createException({
        name: 'EX-004',
        rules: ['gomboc-ai/policy/a'],
        policySets: ['default'],
        createdBy: 'user-1',
        description: 'desc',
      });

      expect(loader.client.updateChannel).not.toHaveBeenCalled();
    });

    it('rolls back created exception channel when a policy set channel is missing', async () => {
      const { loader } = buildLoader();
      const exceptionChannelName = 'acct-1/exception/EX-missing-ps';

      loader.client = {
        createChannel: jest.fn().mockResolvedValue(ok({})),
        updateChannel: jest.fn().mockResolvedValue(ok({})),
        deleteChannel: jest.fn().mockResolvedValue(ok({ success: true })),
        getChannel: jest.fn().mockResolvedValue(null),
      };

      await expect(
        loader.createException({
          name: 'EX-missing-ps',
          rules: ['r1'],
          policySets: ['ghost'],
          createdBy: 'u',
          description: 'd',
        })
      ).rejects.toBeInstanceOf(SagaRollbackError);

      expect(loader.client.deleteChannel).toHaveBeenCalledWith({
        name: exceptionChannelName,
      });
    });
  });

  describe('deleteException', () => {
    it('detaches exception filter from each policy set then deletes the exception channel', async () => {
      const { loader } = buildLoader();
      const exceptionName = 'EX-DEL';
      const exceptionChannelName = `acct-1/exception/${exceptionName}`;
      const exceptionFilter = `(channel "${exceptionChannelName}" true)`;
      const exceptionData = makeExceptionChannelRecord({
        name: exceptionChannelName,
        annotations: {
          'gomboc-ai/created-by': 'u',
          'gomboc-ai/rules': ['r1'],
          'gomboc-ai/policy-sets': ['default', 'platform'],
          'gomboc-ai/description': 'd',
        },
      });
      const policySet1 = makeChannel('acct-1/set/default', [exceptionFilter]);
      const policySet2 = makeChannel('acct-1/set/platform', [
        'other',
        exceptionFilter,
      ]);

      loader.client = {
        getChannel: jest
          .fn()
          .mockResolvedValueOnce(ok(exceptionData))
          .mockResolvedValueOnce(ok(policySet1))
          .mockResolvedValueOnce(ok(policySet2)),
        updateChannel: jest.fn().mockResolvedValue(ok({})),
        deleteChannel: jest.fn().mockResolvedValue(ok({ success: true })),
      };

      await loader.deleteException({ name: exceptionName });

      expect(loader.client.updateChannel).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          name: 'acct-1/set/default',
          query: policySet1.query,
          filters: [],
        })
      );
      expect(loader.client.updateChannel).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          name: 'acct-1/set/platform',
          query: policySet2.query,
          filters: ['other'],
        })
      );
      expect(loader.client.deleteChannel).toHaveBeenCalledWith({
        name: exceptionChannelName,
      });
    });

    it('rolls back prior policy set when a later detach fails', async () => {
      const { loader } = buildLoader();
      const exceptionName = 'EX-DEL-ROLL';
      const exceptionChannelName = `acct-1/exception/${exceptionName}`;
      const exceptionFilter = `(channel "${exceptionChannelName}" true)`;
      const exceptionData = makeExceptionChannelRecord({
        name: exceptionChannelName,
        annotations: {
          'gomboc-ai/created-by': 'u',
          'gomboc-ai/rules': [],
          'gomboc-ai/policy-sets': ['default', 'platform'],
          'gomboc-ai/description': '',
        },
      });
      const policySet1 = makeChannel('acct-1/set/default', [exceptionFilter]);
      const policySet2 = makeChannel('acct-1/set/platform', [exceptionFilter]);
      const updateError = new RulesServiceError('update failed', 'U', 500);

      loader.client = {
        getChannel: jest
          .fn()
          .mockResolvedValueOnce(ok(exceptionData))
          .mockResolvedValueOnce(ok(policySet1))
          .mockResolvedValueOnce(ok(policySet2)),
        updateChannel: jest
          .fn()
          .mockResolvedValueOnce(ok({}))
          .mockResolvedValueOnce(err(updateError)),
        deleteChannel: jest.fn(),
      };

      await expect(
        loader.deleteException({ name: exceptionName })
      ).rejects.toBeInstanceOf(SagaRollbackError);

      expect(loader.client.deleteChannel).not.toHaveBeenCalled();
      expect(loader.client.updateChannel).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({
          name: 'acct-1/set/default',
          filters: policySet1.filters,
        })
      );
    });

    it('restores policy sets when delete channel fails after detaches', async () => {
      const { loader } = buildLoader();
      const exceptionName = 'EX-DEL-FAIL';
      const exceptionChannelName = `acct-1/exception/${exceptionName}`;
      const exceptionFilter = `(channel "${exceptionChannelName}" true)`;
      const exceptionData = makeExceptionChannelRecord({
        name: exceptionChannelName,
        annotations: {
          'gomboc-ai/created-by': 'u',
          'gomboc-ai/rules': [],
          'gomboc-ai/policy-sets': ['a', 'b'],
          'gomboc-ai/description': '',
        },
      });
      const policySetA = makeChannel('acct-1/set/a', [exceptionFilter]);
      const policySetB = makeChannel('acct-1/set/b', [exceptionFilter]);
      const deleteError = new RulesServiceError('delete failed', 'D', 500);

      loader.client = {
        getChannel: jest
          .fn()
          .mockResolvedValueOnce(ok(exceptionData))
          .mockResolvedValueOnce(ok(policySetA))
          .mockResolvedValueOnce(ok(policySetB)),
        updateChannel: jest.fn().mockResolvedValue(ok({})),
        deleteChannel: jest.fn().mockResolvedValue(err(deleteError)),
      };

      await expect(
        loader.deleteException({ name: exceptionName })
      ).rejects.toBeInstanceOf(SagaRollbackError);

      expect(loader.client.updateChannel).toHaveBeenCalledTimes(4);
      expect(loader.client.updateChannel).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({
          name: 'acct-1/set/b',
          filters: policySetB.filters,
        })
      );
      expect(loader.client.updateChannel).toHaveBeenNthCalledWith(
        4,
        expect.objectContaining({
          name: 'acct-1/set/a',
          filters: policySetA.filters,
        })
      );
    });

    it('deletes the exception channel when no policy sets are listed', async () => {
      const { loader } = buildLoader();
      const exceptionName = 'EX-EMPTY-PS';
      const exceptionChannelName = `acct-1/exception/${exceptionName}`;
      const exceptionData = makeExceptionChannelRecord({
        name: exceptionChannelName,
        annotations: {
          'gomboc-ai/created-by': 'u',
          'gomboc-ai/rules': [],
          'gomboc-ai/policy-sets': [],
          'gomboc-ai/description': '',
        },
      });

      loader.client = {
        getChannel: jest.fn().mockResolvedValueOnce(ok(exceptionData)),
        updateChannel: jest.fn(),
        deleteChannel: jest.fn().mockResolvedValue(ok({ success: true })),
      };

      await loader.deleteException({ name: exceptionName });

      expect(loader.client.getChannel).toHaveBeenCalledTimes(1);
      expect(loader.client.updateChannel).not.toHaveBeenCalled();
      expect(loader.client.deleteChannel).toHaveBeenCalledWith({
        name: exceptionChannelName,
      });
    });

    it('skips updateChannel when exception filter is already absent and still deletes channel', async () => {
      const { loader } = buildLoader();
      const exceptionName = 'EX-NO-FILTER';
      const exceptionChannelName = `acct-1/exception/${exceptionName}`;
      const exceptionData = makeExceptionChannelRecord({
        name: exceptionChannelName,
        annotations: {
          'gomboc-ai/created-by': 'u',
          'gomboc-ai/rules': [],
          'gomboc-ai/policy-sets': ['default'],
          'gomboc-ai/description': '',
        },
      });
      const policySet = makeChannel('acct-1/set/default', []);

      loader.client = {
        getChannel: jest
          .fn()
          .mockResolvedValueOnce(ok(exceptionData))
          .mockResolvedValueOnce(ok(policySet)),
        updateChannel: jest.fn().mockResolvedValue(ok({})),
        deleteChannel: jest.fn().mockResolvedValue(ok({ success: true })),
      };

      await loader.deleteException({ name: exceptionName });

      expect(loader.client.updateChannel).not.toHaveBeenCalled();
      expect(loader.client.deleteChannel).toHaveBeenCalledWith({
        name: exceptionChannelName,
      });
    });
  });

  describe('getExceptionsLinkedToPolicySet', () => {
    it('paginates through exceptions and returns only those linked to the target policy set', async () => {
      const { loader } = buildLoader();
      const getExceptionsSpy = jest
        .spyOn(loader, 'getExceptions')
        .mockResolvedValueOnce({
          items: [
            makeMinimalException({
              name: 'EX-A',
              rules: [],
              policySets: ['default'],
              createdBy: 'u',
            }),
            makeMinimalException({
              name: 'EX-B',
              rules: [],
              policySets: ['platform'],
              createdBy: 'u',
            }),
          ],
          total: 120,
          page: 1,
          perPage: 100,
        })
        .mockResolvedValueOnce({
          items: [
            makeMinimalException({
              name: 'EX-C',
              rules: [],
              policySets: ['default', 'platform'],
              createdBy: 'u',
            }),
          ],
          total: 120,
          page: 2,
          perPage: 100,
        });

      const linked = await loader.getExceptionsLinkedToPolicySet({
        policySetName: 'default',
      });

      expect(getExceptionsSpy).toHaveBeenNthCalledWith(1, {
        page: 1,
        perPage: 100,
      });
      expect(getExceptionsSpy).toHaveBeenNthCalledWith(2, {
        page: 2,
        perPage: 100,
      });
      expect(
        linked.map((exception: { name: string }) => exception.name)
      ).toEqual(['EX-A', 'EX-C']);
    });
  });

  describe('deletePolicySet', () => {
    it('deletes linked exceptions before deleting the policy set channel', async () => {
      const { loader } = buildLoader();
      const getLinkedExceptionsSpy = jest
        .spyOn(loader, 'getExceptionsLinkedToPolicySet')
        .mockResolvedValue([
          makeMinimalLinkedException('EX-A'),
          makeMinimalLinkedException('EX-B'),
        ]);
      const deleteExceptionSpy = jest
        .spyOn(loader, 'deleteException')
        .mockResolvedValue(undefined);

      loader.client = {
        searchForChannels: jest.fn().mockResolvedValue(
          ok({
            channels: [],
            total: 0,
            page: 1,
            perPage: 100,
          })
        ),
        batchUpsertChannels: jest.fn().mockResolvedValue(ok({ results: [] })),
        deleteChannel: jest.fn().mockResolvedValue(ok({ success: true })),
      };

      await loader.deletePolicySet({ name: 'default' });

      expect(getLinkedExceptionsSpy).toHaveBeenCalledWith({
        policySetName: 'default',
      });
      expect(deleteExceptionSpy).toHaveBeenNthCalledWith(1, { name: 'EX-A' });
      expect(deleteExceptionSpy).toHaveBeenNthCalledWith(2, { name: 'EX-B' });
      expect(loader.client.searchForChannels).toHaveBeenCalled();
      expect(loader.client.deleteChannel).toHaveBeenCalledWith({
        name: 'acct-1/set/default',
      });

      const lastExceptionCallOrder = Math.max(
        ...deleteExceptionSpy.mock.invocationCallOrder
      );
      const removeWorkspacesCallOrder = (
        loader.client.searchForChannels as jest.Mock
      ).mock.invocationCallOrder[0];
      const deletePolicySetCallOrder = (
        loader.client.deleteChannel as jest.Mock
      ).mock.invocationCallOrder[0];
      expect(lastExceptionCallOrder).toBeLessThan(removeWorkspacesCallOrder);
      expect(removeWorkspacesCallOrder).toBeLessThan(deletePolicySetCallOrder);
    });
  });

  describe('getException', () => {
    it('maps channel to Exception with short name, rules, policySets, and metadata', async () => {
      const { loader } = buildLoader();
      loader.client = {
        getChannel: jest.fn().mockResolvedValue(
          ok(
            makeExceptionChannelRecord({
              name: 'acct-1/exception/MY-EX',
            })
          )
        ),
      };

      const ex = await loader.getException({ name: 'MY-EX' });

      expect(loader.client.getChannel).toHaveBeenCalledWith({
        name: 'acct-1/exception/MY-EX',
      });
      expect(ex.name).toBe('MY-EX');
      expect(ex.rules).toEqual(['gomboc-ai/rule-a']);
      expect(ex.policySets).toEqual(['default', 'platform']);
      expect(ex.createdBy).toBe('user-1');
      expect(ex.description).toBe('desc');
    });

    it('parses rules from query when annotations.rules is absent', async () => {
      const { loader } = buildLoader();
      loader.client = {
        getChannel: jest.fn().mockResolvedValue(
          ok(
            makeExceptionChannelRecord({
              name: 'acct-1/exception/LEG',
              query: '(or (eq $.name "legacy-a") (eq $.name "legacy-b"))',
              annotations: {
                'gomboc-ai/created-by': 'u',
                'gomboc-ai/policy-sets': ['p1'],
                'gomboc-ai/description': 'd',
                // intentionally omits 'gomboc-ai/rules' to exercise query-parse fallback
              },
            })
          )
        ),
      };

      const ex = await loader.getException({ name: 'LEG' });

      expect(ex.rules).toEqual(['legacy-a', 'legacy-b']);
      expect(ex.policySets).toEqual(['p1']);
    });
  });

  describe('getExceptions', () => {
    it('searches by account exception prefix and maps channels to Exception items', async () => {
      const { loader } = buildLoader();
      loader.client = {
        searchForChannels: jest.fn().mockResolvedValue(
          ok({
            channels: [
              makeExceptionChannelRecord({
                name: 'acct-1/exception/A',
                annotations: {
                  'gomboc-ai/created-by': 'a',
                  'gomboc-ai/rules': ['r1'],
                  'gomboc-ai/policy-sets': ['default'],
                  'gomboc-ai/description': '',
                },
              }),
              makeExceptionChannelRecord({
                name: 'acct-1/exception/B',
                query: '',
                annotations: {
                  'gomboc-ai/created-by': 'b',
                  'gomboc-ai/rules': [],
                  'gomboc-ai/policy-sets': [],
                  'gomboc-ai/description': '',
                },
              }),
            ],
            total: 2,
            page: 1,
            perPage: 20,
          })
        ),
      };

      const page = await loader.getExceptions({ page: 1, perPage: 20 });

      expect(loader.client.searchForChannels).toHaveBeenCalledWith({
        page: 1,
        perPage: 20,
        query: '(contains "acct-1/exception/" $.name)',
      });
      expect(page.total).toBe(2);
      expect(page.items.map((item: { name: string }) => item.name)).toEqual([
        'A',
        'B',
      ]);
      expect(page.items[0].rules).toEqual(['r1']);
    });
  });

  describe('getExceptionRules', () => {
    it('returns empty array without calling getRule when exception has no rules', async () => {
      const { loader } = buildLoader();
      loader.client = { getRule: jest.fn() };
      jest.spyOn(loader, 'getException').mockResolvedValue(
        makeMinimalException({
          name: 'EX',
          rules: [],
          policySets: [],
          createdBy: '',
        })
      );

      const rules = await loader.getExceptionRules({ name: 'EX' });

      expect(rules).toEqual([]);
      expect(loader.client.getRule).not.toHaveBeenCalled();
    });

    it('fetches each rule by name via getRule', async () => {
      const { loader } = buildLoader();
      loader.client = {
        getRule: jest
          .fn()
          .mockResolvedValueOnce(ok({ name: 'gomboc-ai/a', id: 'id-a' }))
          .mockResolvedValueOnce(ok({ name: 'gomboc-ai/b', id: 'id-b' })),
      };
      jest.spyOn(loader, 'getException').mockResolvedValue(
        makeMinimalException({
          name: 'EX',
          rules: ['gomboc-ai/a', 'gomboc-ai/b'],
          policySets: ['default'],
          createdBy: 'u',
        })
      );

      const rules = await loader.getExceptionRules({ name: 'EX' });

      expect(loader.client.getRule).toHaveBeenNthCalledWith(1, {
        name: 'gomboc-ai/a',
      });
      expect(loader.client.getRule).toHaveBeenNthCalledWith(2, {
        name: 'gomboc-ai/b',
      });
      expect(rules).toEqual([
        { name: 'gomboc-ai/a', id: 'id-a' },
        { name: 'gomboc-ai/b', id: 'id-b' },
      ]);
    });
  });

  describe('getExceptionPolicySets', () => {
    it('returns empty array without calling getPolicySet when exception has no policy sets', async () => {
      const { loader } = buildLoader();
      jest.spyOn(loader, 'getException').mockResolvedValue(
        makeMinimalException({
          name: 'EX',
          rules: [],
          policySets: [],
          createdBy: '',
        })
      );
      const getPolicySet = jest
        .spyOn(loader, 'getPolicySet')
        .mockResolvedValue(makeMinimalPolicySet('_unused', 'id-0'));

      const sets = await loader.getExceptionPolicySets({ name: 'EX' });

      expect(sets).toEqual([]);
      expect(getPolicySet).not.toHaveBeenCalled();
    });

    it('loads each policy set via getPolicySet', async () => {
      const { loader } = buildLoader();
      jest.spyOn(loader, 'getException').mockResolvedValue(
        makeMinimalException({
          name: 'EX',
          rules: [],
          policySets: ['default', 'platform'],
          createdBy: 'u',
        })
      );
      jest
        .spyOn(loader, 'getPolicySet')
        .mockResolvedValueOnce(makeMinimalPolicySet('default', 'ps-1'))
        .mockResolvedValueOnce(makeMinimalPolicySet('platform', 'ps-2'));

      const sets = await loader.getExceptionPolicySets({ name: 'EX' });

      expect(loader.getPolicySet).toHaveBeenNthCalledWith(1, 'default');
      expect(loader.getPolicySet).toHaveBeenNthCalledWith(2, 'platform');
      expect(sets.map(set => ({ name: set.name, id: set.id }))).toEqual([
        { name: 'default', id: 'ps-1' },
        { name: 'platform', id: 'ps-2' },
      ]);
    });
  });

  describe('createPolicySet', () => {
    it('throws when both applyToAllWorkspaces and workspaceIds are provided', async () => {
      const { loader } = buildLoader();
      await expect(
        loader.createPolicySet({
          name: 'ps',
          createdBy: 'u',
          applyToAllWorkspaces: true,
          workspaceIds: ['ws-1'],
        })
      ).rejects.toThrow(
        'Unable to determine if policy set should be applied to all Workspaces'
      );
    });

    it('throws 409 POLICY_SET_NAME_TAKEN when channel already exists', async () => {
      const { loader } = buildLoader();
      loader.client = {
        getChannel: jest
          .fn()
          .mockResolvedValue(ok(makeChannel('acct-1/set/existing'))),
      };

      let thrown: unknown;
      try {
        await loader.createPolicySet({
          name: 'existing',
          createdBy: 'u',
          applyToAllWorkspaces: false,
        });
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(RulesServiceError);
      expect((thrown as RulesServiceError).code).toBe('POLICY_SET_NAME_TAKEN');
      expect((thrown as RulesServiceError).statusCode).toBe(409);
    });

    it('throws 503 SERVICE_UNAVAILABLE when getChannel fails with non-404 error', async () => {
      const { loader } = buildLoader();
      loader.client = {
        getChannel: jest
          .fn()
          .mockResolvedValue(
            err({ message: 'db error', code: 'DB_ERR', statusCode: 500 })
          ),
      };

      let thrown: unknown;
      try {
        await loader.createPolicySet({
          name: 'ps',
          createdBy: 'u',
          applyToAllWorkspaces: false,
        });
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(RulesServiceError);
      expect((thrown as RulesServiceError).code).toBe('SERVICE_UNAVAILABLE');
      expect((thrown as RulesServiceError).statusCode).toBe(503);
    });

    it('calls batchUpsertChannels with correct annotations on happy path', async () => {
      const { loader } = buildLoader();
      const policySetChannel = makeChannel('acct-1/set/new-ps');
      loader.client = {
        getChannel: jest
          .fn()
          .mockResolvedValue(
            err({ message: 'not found', code: 'NOT_FOUND', statusCode: 404 })
          ),
        batchUpsertChannels: jest.fn().mockResolvedValue(
          ok({
            results: [{ name: 'acct-1/set/new-ps', channel: policySetChannel }],
          })
        ),
      };

      const result = await loader.createPolicySet({
        name: 'new-ps',
        createdBy: 'alice',
        applyToAllWorkspaces: false,
        description: 'My policy set',
      });

      expect(loader.client.batchUpsertChannels).toHaveBeenCalledWith(
        expect.objectContaining({
          channels: expect.arrayContaining([
            expect.objectContaining({
              name: 'acct-1/set/new-ps',
              annotations: expect.objectContaining({
                'gomboc-ai/created-by': 'alice',
                'gomboc-ai/type': 'policy-set',
                'gomboc-ai/is-default': false,
              }),
            }),
          ]),
        })
      );
      expect(result.name).toBe('new-ps');
    });

    it('also upserts global channel when applyToAllWorkspaces is true', async () => {
      const { loader } = buildLoader();
      const policySetChannel = makeChannel('acct-1/set/global-ps');
      const globalChannel = makeChannel('acct-1/accounts/global');
      loader.client = {
        getChannel: jest
          .fn()
          .mockResolvedValueOnce(err({ message: 'not found', statusCode: 404 }))
          .mockResolvedValueOnce(ok(globalChannel)),
        batchUpsertChannels: jest.fn().mockResolvedValue(
          ok({
            results: [
              { name: 'acct-1/set/global-ps', channel: policySetChannel },
            ],
          })
        ),
      };

      await loader.createPolicySet({
        name: 'global-ps',
        createdBy: 'alice',
        applyToAllWorkspaces: true,
      });

      const upsertCall = (loader.client.batchUpsertChannels as jest.Mock).mock
        .calls[0][0] as BatchUpsertChannelsRequestParams;
      const channelNames = upsertCall.channels.map(c => c.name);
      expect(channelNames).toContain('acct-1/set/global-ps');
      expect(channelNames).toContain('acct-1/accounts/global');
    });
  });

  describe('additional loader coverage', () => {
    it('loadAllAvailablePolicies maps classifications into policies', async () => {
      const { loader } = buildLoader();
      loader.client = {
        getAllClassifications: jest.fn().mockResolvedValue(
          ok({
            classifications: [
              {
                name: 'gomboc-ai/policy-1',
                shortName: 'Policy One',
                description: 'desc',
                annotations: { 'gomboc-ai/type': 'policy' },
              },
            ],
          })
        ),
      };

      await loader.loadAllAvailablePolicies();

      expect(loader.client.getAllClassifications).toHaveBeenCalled();
      expect(loader.allPolicies).toEqual([
        {
          id: 'gomboc-ai/policy-1',
          name: 'Policy One',
          description: 'desc',
          annotations: { 'gomboc-ai/type': 'policy' },
        },
      ]);
    });

    it('loadAllAvailablePolicies throws when sdk returns an error', async () => {
      const { loader } = buildLoader();
      loader.client = {
        getAllClassifications: jest
          .fn()
          .mockResolvedValue(err(new RulesServiceError('boom', 'X', 500))),
      };

      await expect(loader.loadAllAvailablePolicies()).rejects.toThrow('boom');
    });

    it('getPoliciesByIds deduplicates names and maps to policy types', async () => {
      const { loader } = buildLoader();
      const batchRow = {
        name: 'gomboc-ai/policy-1',
        shortName: 'Policy One',
        description: 'desc',
        annotations: { key: 'value' },
      } as unknown as Classification;
      jest.spyOn(loader, 'getPoliciesBatch').mockResolvedValue([batchRow]);

      const result = await loader.getPoliciesByIds(
        ['gomboc-ai/policy-1', 'gomboc-ai/policy-1', ''],
        {
          includeDeprecated: true,
        }
      );

      expect(loader.getPoliciesBatch).toHaveBeenCalledWith({
        names: ['gomboc-ai/policy-1'],
        includeDeprecated: true,
      });
      expect(result).toEqual([
        {
          id: 'gomboc-ai/policy-1',
          name: 'Policy One',
          description: 'desc',
          annotations: { key: 'value' },
        },
      ]);
    });

    it('getPoliciesByIds returns empty list when input names are empty', async () => {
      const { loader } = buildLoader();
      const spy = jest.spyOn(loader, 'getPoliciesBatch');

      const result = await loader.getPoliciesByIds(['', '']);

      expect(result).toEqual([]);
      expect(spy).not.toHaveBeenCalled();
    });

    it('getChannelSafe returns null when getChannel fails', async () => {
      const { loader } = buildLoader();
      loader.client = {
        getChannel: jest
          .fn()
          .mockResolvedValue(
            err(new RulesServiceError('nope', 'NOT_FOUND', 404))
          ),
      };

      const result = await loader.getChannelSafe({
        name: 'acct-1/set/missing',
      });

      expect(result).toBeNull();
    });

    it('getPolicySet maps channel fields and linked exceptions', async () => {
      const { loader } = buildLoader();
      jest
        .spyOn(loader, 'getWorkspaceChannelsWithPolicySet')
        .mockResolvedValue([
          makeChannel('acct-1/wksp/ws-b'),
          makeChannel('acct-1/wksp/ws-a'),
        ]);
      jest
        .spyOn(loader, 'getExceptionsLinkedToPolicySet')
        .mockResolvedValue([
          makeMinimalLinkedException('EX-1'),
          makeMinimalLinkedException('EX-2'),
        ]);
      loader.client = {
        getChannel: jest.fn().mockResolvedValue(
          ok({
            ...makeChannel('acct-1/set/my-policy-set'),
            query:
              '(or (contains "p1" finding.classification) (contains "p2" finding.classification))',
            annotations: {
              'gomboc-ai/created-by': 'alice',
              'gomboc-ai/updated-by': 'bob',
              'gomboc-ai/type': 'policy-set',
              'gomboc-ai/is-default': false,
              'gomboc-ai/apply-to-all-workspaces': false,
              'gomboc-ai/description': 'desc',
            },
          })
        ),
      };

      const result = await loader.getPolicySet('my-policy-set');

      expect(result.name).toBe('my-policy-set');
      expect(result.policiesCount).toBe(2);
      expect(result.exceptionsCount).toBe(2);
      expect(result.appliedWorkspaceIds).toEqual(['ws-a', 'ws-b']);
      expect(result.createdBy).toBe('alice');
      expect(result.updatedBy).toBe('bob');
    });

    it('getPolicySetPolicies loads all policies and filters by query policy names', async () => {
      const { loader } = buildLoader();
      loader.allPolicies = [];
      jest.spyOn(loader, 'loadAllPolicies').mockImplementation(async () => {
        const policies: Policy[] = [
          { id: 'p1', name: 'Policy 1', annotations: null, description: null },
          { id: 'p2', name: 'Policy 2', annotations: null, description: null },
          { id: 'p3', name: 'Policy 3', annotations: null, description: null },
        ];
        loader.allPolicies = policies;
      });

      const policySetInput = makeMinimalPolicySet('x', 'ps-x', {
        query:
          '(or (contains "p1" finding.classification) (contains "p3" finding.classification))',
        policiesCount: 2,
      });
      const result = await loader.getPolicySetPolicies(policySetInput);

      expect(loader.loadAllPolicies).toHaveBeenCalled();
      expect(result.map((p: Policy) => p.id)).toEqual(['p1', 'p3']);
    });

    it('getFrameworks returns classifications and throws on errors', async () => {
      const { loader } = buildLoader();
      loader.client = {
        getAllClassifications: jest
          .fn()
          .mockResolvedValueOnce(
            ok({ classifications: [{ name: 'framework-1' }] })
          )
          .mockResolvedValueOnce(
            err(new RulesServiceError('svc unavailable', 'X', 503))
          ),
      };

      const frameworks = await loader.getFrameworks();
      expect(frameworks).toEqual([{ name: 'framework-1' }]);

      await expect(loader.getFrameworks()).rejects.toThrow(
        'Unable to fetch frameworks'
      );
    });
  });

  describe('getPolicySets', () => {
    it('strips {accountId}/set/ prefix from channel names', async () => {
      const { loader } = buildLoader();
      jest.spyOn(loader, 'getExceptions').mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        perPage: 100,
      });
      jest
        .spyOn(loader, 'getWorkspaceChannelsWithPolicySet')
        .mockResolvedValue([]);
      loader.client = {
        searchForChannels: jest.fn().mockResolvedValue(
          ok({
            channels: [makeChannel('acct-1/set/my-policy-set')],
            total: 1,
            page: 1,
            perPage: 20,
          })
        ),
      };

      const result = await loader.getPolicySets();

      expect(result.items[0].name).toBe('my-policy-set');
    });

    it('counts policies from (contains "..." finding.classification) clauses in query', async () => {
      const { loader } = buildLoader();
      jest.spyOn(loader, 'getExceptions').mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        perPage: 100,
      });
      jest
        .spyOn(loader, 'getWorkspaceChannelsWithPolicySet')
        .mockResolvedValue([]);
      const channelWithPolicies = makeChannel('acct-1/set/counted');
      channelWithPolicies.query =
        '(or (contains "p1" finding.classification) (contains "p2" finding.classification))';
      loader.client = {
        searchForChannels: jest.fn().mockResolvedValue(
          ok({
            channels: [channelWithPolicies],
            total: 1,
            page: 1,
            perPage: 20,
          })
        ),
      };

      const result = await loader.getPolicySets();

      expect(result.items[0].policiesCount).toBe(2);
    });

    it('merges exceptionsCount from exception search', async () => {
      const { loader } = buildLoader();
      jest.spyOn(loader, 'getExceptions').mockResolvedValue({
        items: [
          makeMinimalException({
            name: 'EX-1',
            rules: [],
            policySets: ['my-ps'],
            createdBy: 'u',
          }),
          makeMinimalException({
            name: 'EX-2',
            rules: [],
            policySets: ['my-ps'],
            createdBy: 'u',
          }),
          makeMinimalException({
            name: 'EX-3',
            rules: [],
            policySets: ['my-ps'],
            createdBy: 'u',
          }),
        ],
        total: 3,
        page: 1,
        perPage: 100,
      });
      jest
        .spyOn(loader, 'getWorkspaceChannelsWithPolicySet')
        .mockResolvedValue([]);
      loader.client = {
        searchForChannels: jest.fn().mockResolvedValue(
          ok({
            channels: [makeChannel('acct-1/set/my-ps')],
            total: 1,
            page: 1,
            perPage: 20,
          })
        ),
      };

      const result = await loader.getPolicySets();

      expect(result.items[0].exceptionsCount).toBe(3);
    });
  });

  describe('getWorkspacePolicySets', () => {
    it('returns policy set names from both global and workspace channels combined', async () => {
      const { loader } = buildLoader();
      const globalQuery =
        '(and (or (channel "acct-1/set/default" true) (channel "acct-1/set/platform" true)) (not (eq $.annotations["deprecated"] "true")))';
      const workspaceQuery =
        '(and (or (channel "acct-1/set/custom" true)) (not (eq $.annotations["deprecated"] "true")))';

      loader.client = {
        getChannel: jest
          .fn()
          .mockResolvedValueOnce(
            ok({
              ...makeChannel('acct-1/accounts/global'),
              query: globalQuery,
            })
          )
          .mockResolvedValueOnce(
            ok({
              ...makeChannel('acct-1/wksp/ws-1'),
              query: workspaceQuery,
            })
          ),
      };

      const result = await loader.getWorkspacePolicySets('ws-1');

      expect(result).toContain('default');
      expect(result).toContain('platform');
      expect(result).toContain('custom');
    });

    it('returns only global policy set names when workspace channel is missing', async () => {
      const { loader } = buildLoader();
      const globalQuery =
        '(and (or (channel "acct-1/set/default" true)) (not (eq $.annotations["deprecated"] "true")))';

      loader.client = {
        getChannel: jest
          .fn()
          .mockResolvedValueOnce(
            ok({
              ...makeChannel('acct-1/accounts/global'),
              query: globalQuery,
            })
          )
          .mockResolvedValueOnce(
            err({ message: 'not found', statusCode: 404 })
          ),
      };

      const result = await loader.getWorkspacePolicySets('ws-missing');

      expect(result).toEqual(['default']);
    });

    it('deduplicates policy set names that appear in both channels', async () => {
      const { loader } = buildLoader();
      const sharedQuery =
        '(and (or (channel "acct-1/set/default" true)) (not (eq $.annotations["deprecated"] "true")))';

      loader.client = {
        getChannel: jest
          .fn()
          .mockResolvedValueOnce(
            ok({
              ...makeChannel('acct-1/accounts/global'),
              query: sharedQuery,
            })
          )
          .mockResolvedValueOnce(
            ok({ ...makeChannel('acct-1/wksp/ws-1'), query: sharedQuery })
          ),
      };

      const result = await loader.getWorkspacePolicySets('ws-1');

      expect(result.filter((n: string) => n === 'default')).toHaveLength(1);
    });
  });
});

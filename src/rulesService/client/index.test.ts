const mockInit = jest.fn();

jest.doMock('./rulesServiceLoader', () => ({
  RulesServiceLoader: {
    init: mockInit,
  },
}));

describe('initRulesServiceLoader', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('initializes once and returns cached loader for same token, account, and baseUrl', async () => {
    const logger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };
    const loader = { id: 'loader-1' };
    mockInit.mockResolvedValue(loader);
    const { initRulesServiceLoader } = await import('./index');

    const opts = {
      accessToken: 'token-a',
      accountId: 'acct-1',
      baseUrl: 'https://rules.example.com',
      logger,
    };
    const first = await initRulesServiceLoader(opts);
    const second = await initRulesServiceLoader(opts);

    expect(mockInit).toHaveBeenCalledTimes(1);
    expect(mockInit).toHaveBeenCalledWith(opts);
    expect(first).toBe(loader);
    expect(second).toBe(loader);
  });

  it('creates a new loader when baseUrl differs', async () => {
    const logger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };
    mockInit
      .mockResolvedValueOnce({ id: 'a' })
      .mockResolvedValueOnce({ id: 'b' });
    const { initRulesServiceLoader } = await import('./index');

    const first = await initRulesServiceLoader({
      accessToken: 't',
      accountId: 'acct-1',
      baseUrl: 'https://a.example.com',
      logger,
    });
    const second = await initRulesServiceLoader({
      accessToken: 't',
      accountId: 'acct-1',
      baseUrl: 'https://b.example.com',
      logger,
    });

    expect(mockInit).toHaveBeenCalledTimes(2);
    expect(first).toEqual({ id: 'a' });
    expect(second).toEqual({ id: 'b' });
  });
});

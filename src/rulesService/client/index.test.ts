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

  it('initializes on every call even for same token and account', async () => {
    const logger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };
    const firstLoader = { id: 'loader-1' };
    const secondLoader = { id: 'loader-2' };
    mockInit
      .mockResolvedValueOnce(firstLoader)
      .mockResolvedValueOnce(secondLoader);
    const { initRulesServiceLoader } = await import('./index');

    const opts = {
      accessToken: 'token-a',
      accountId: 'acct-1',
      baseUrl: 'https://rules.example.com',
      logger,
    };
    const first = await initRulesServiceLoader(opts);
    const second = await initRulesServiceLoader(opts);

    expect(mockInit).toHaveBeenCalledTimes(2);
    expect(mockInit).toHaveBeenNthCalledWith(1, opts);
    expect(mockInit).toHaveBeenNthCalledWith(2, opts);
    expect(first).toBe(firstLoader);
    expect(second).toBe(secondLoader);
  });

  it('initializes again when baseUrl differs with same token/account', async () => {
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

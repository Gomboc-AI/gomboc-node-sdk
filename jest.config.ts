import type { Config } from 'jest';

const config: Config = {
  clearMocks: true,
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__generated__/**',
    '!src/**/*.stories.{js,jsx,ts,tsx}',
    '!src/**/*.test.{js,jsx,ts,tsx}',
    '!src/**/*.spec.{js,jsx,ts,tsx}',
    '!src/**/*.integration.test.{js,jsx,ts,tsx}',
  ],
  coverageDirectory: 'coverage',
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/coverage/',
    '/.next/',
    '/dist/',
  ],
  coverageProvider: 'v8',
  coverageReporters: ['text', 'lcov', 'html', 'json'],
  moduleDirectories: ['node_modules'],
  testEnvironment: 'node',
  testMatch: [
    '**/__tests__/**/*.[jt]s?(x)',
    '**/?(*.)+(spec|test).[tj]s?(x)',
    '<rootDir>/src/**/*.test.[jt]s?(x)',
    '<rootDir>/src/**/*.spec.[jt]s?(x)',
  ],
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.test\\.ts$'],
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.jest.json',
      },
    ],
  },
};

export default config;

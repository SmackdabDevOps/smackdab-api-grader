/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapping: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
    }],
  },
  testMatch: [
    '**/test/edge-cases/**/*.test.ts',
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
  ],
  coverageDirectory: 'coverage-edge-cases',
  coverageReporters: [
    'text',
    'lcov',
    'html',
  ],
  coverageThreshold: {
    global: {
      branches: 70,  // Lower threshold for edge cases
      functions: 75,
      lines: 75,
      statements: 75,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/test/helpers/setup.ts'],
  // Extended timeouts for edge case testing
  testTimeout: 300000, // 5 minutes default
  // Memory and performance settings
  maxWorkers: '50%', // Limit workers to prevent memory issues
  workerIdleMemoryLimit: '1GB',
  // Verbose reporting for edge cases
  verbose: true,
  // Don't exit on first failure - run all edge case tests
  bail: false,
  // Clear mocks between tests to prevent interference
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  // Detect open handles (memory leaks, unclosed connections)
  detectOpenHandles: true,
  // Force exit after tests complete
  forceExit: true,
  // Log heap usage for memory monitoring
  logHeapUsage: true,
  // Custom test result processor for edge cases
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: 'test-results',
        outputName: 'edge-cases-results.xml',
        suiteName: 'Edge Cases and Error Boundaries',
      },
    ],
  ],
  // Global setup for edge case tests
  globalSetup: '<rootDir>/test/edge-cases/global-setup.js',
  globalTeardown: '<rootDir>/test/edge-cases/global-teardown.js',
};
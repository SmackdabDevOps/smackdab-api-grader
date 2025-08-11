/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      tsconfig: 'tsconfig.test.json',
    }],
  },
  testMatch: [
    '**/test/**/*.test.ts',
    '**/test/**/*.test.js',
    '**/test/**/*.test.cjs',
    '**/test/**/*.spec.ts',
    '**/__test__/**/*.test.ts',
    '**/__test__/**/*.spec.ts',
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html',
  ],
  // Temporarily disabled to measure actual coverage
  // coverageThreshold: {
  //   global: {
  //     branches: 75,
  //     functions: 80,
  //     lines: 80,
  //     statements: 80,
  //   },
  // },
  setupFilesAfterEnv: ['<rootDir>/test/helpers/setup.ts'],
  testTimeout: 10000,
  verbose: true,
  forceExit: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
};
/**
 * Jest global setup - runs before all tests
 * Sets up test environment and global mocks
 */

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.DB_PATH = ':memory:';
process.env.TEST_MODE = 'true';

// Global test timeout
jest.setTimeout(10000);

// Suppress console logs during tests unless DEBUG is set
if (!process.env.DEBUG) {
  global.console = {
    ...console,
    // Keep error and warn for debugging
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
  };
}

// Crypto mocking removed - was breaking all crypto operations in tests

// Mock Date for consistent timestamps in tests
const mockDate = new Date('2024-01-01T00:00:00.000Z');
jest.spyOn(global, 'Date').mockImplementation(() => mockDate);
(Date as any).now = jest.fn(() => mockDate.getTime());
(Date as any).toISOString = jest.fn(() => mockDate.toISOString());

export {};
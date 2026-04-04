/**
 * Unit Test Setup - runs before all unit tests
 *
 * This setup is lighter than E2E setup - no MongoDB Memory Server needed
 * since unit tests should mock all database operations.
 */
import { vi } from 'vitest';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.PORT = '3010';

// Mock Redis URL (tests should mock Redis operations)
process.env.REDIS_URL = 'redis://localhost:6379';

// Mock MCP service credentials
process.env.GENFEEDAI_API_URL = 'http://localhost:3001';
process.env.MCP_SECRET_KEY = 'test-mock-mcp-secret';

// Clear mocks between tests
afterEach(() => {
  vi.clearAllMocks();
});

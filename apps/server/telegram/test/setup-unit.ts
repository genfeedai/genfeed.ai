import 'reflect-metadata';
import { vi } from 'vitest';

process.env.NODE_ENV = 'test';

// Clear mocks between tests
afterEach(() => {
  vi.clearAllMocks();
});

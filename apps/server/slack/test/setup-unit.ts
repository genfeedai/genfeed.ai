import 'reflect-metadata';
import { vi } from 'vitest';

vi.stubEnv('NODE_ENV', 'test');

// Clear mocks between tests
afterEach(() => {
  vi.clearAllMocks();
});

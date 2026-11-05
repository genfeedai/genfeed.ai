import type { ExecutionContext } from '@nestjs/common';
import { vi } from 'vitest';

interface MockContextOverrides {
  request?: Record<string, unknown>;
  response?: Record<string, unknown>;
}

export const createMockExecutionContext = (
  overrides: MockContextOverrides = {},
): ExecutionContext =>
  ({
    getArgByIndex: vi.fn(),
    getArgs: vi.fn(),
    getClass: vi.fn(),
    getHandler: vi.fn(),
    getType: vi.fn(),
    switchToHttp: vi.fn().mockReturnValue({
      getNext: vi.fn(),
      getRequest: vi.fn().mockReturnValue({
        body: {},
        headers: {},
        params: {},
        query: {},
        user: { email: 'test@example.com', id: 'user-id' },
        ...overrides.request,
      }),
      getResponse: vi.fn().mockReturnValue({
        json: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis(),
        status: vi.fn().mockReturnThis(),
        ...overrides.response,
      }),
    }),
    switchToRpc: vi.fn(),
    switchToWs: vi.fn(),
  }) as unknown as ExecutionContext;

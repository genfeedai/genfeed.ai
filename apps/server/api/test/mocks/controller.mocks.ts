import { ExecutionContext } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { vi } from 'vitest';

interface MockContextOverrides {
  request?: Record<string, unknown>;
  response?: Record<string, unknown>;
}

interface MockRequestOverrides {
  user?: Record<string, unknown> | null;
  [key: string]: unknown;
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

export const createMockGuard = (canActivate: boolean = true) => ({
  canActivate: vi.fn().mockReturnValue(canActivate),
});

export const createMockInterceptor = (response: unknown = {}) => ({
  intercept: vi.fn().mockImplementation(() => {
    return {
      pipe: vi.fn().mockReturnValue(response),
    };
  }),
});

export const createMockDecorator = () => {
  return () => {
    // Mock decorator implementation
  };
};

export const mockAuthRequest = (overrides: MockRequestOverrides = {}) => ({
  auth: {
    orgId: 'org-id',
    sessionId: 'session-id',
    userId: 'clerk-user-id',
  },
  body: {},
  headers: {
    authorization: 'Bearer test-token',
  },
  params: {},
  publicMetadata: {
    email: 'test@example.com',
    isOwner: true,
    organization: 'test-id-' + Math.random().toString(36).slice(2, 9),
    user: 'test-id-' + Math.random().toString(36).slice(2, 9),
  },
  query: {},
  user: {
    email: 'test@example.com',
    id: 'user-id',
  },
  ...overrides,
});

export const createTestingModule = async (metadata: {
  controllers?: unknown[];
  providers?: unknown[];
  imports?: unknown[];
}): Promise<TestingModule> => {
  const module = await Test.createTestingModule(metadata).compile();
  module.useLogger(false);
  return module;
};

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { keysCommand } from '../../src/commands/keys';

const {
  mockCreateApiKey,
  mockHandleError,
  mockListApiKeys,
  mockPrint,
  mockPrintJson,
  mockRequireAuth,
  mockRevokeApiKey,
  mockRotateApiKey,
  mockSpinnerStop,
} = vi.hoisted(() => ({
  mockCreateApiKey: vi.fn(),
  mockHandleError: vi.fn((error: unknown) => {
    throw error;
  }),
  mockListApiKeys: vi.fn(),
  mockPrint: vi.fn(),
  mockPrintJson: vi.fn(),
  mockRequireAuth: vi.fn(),
  mockRevokeApiKey: vi.fn(),
  mockRotateApiKey: vi.fn(),
  mockSpinnerStop: vi.fn(),
}));

vi.mock('ora', () => {
  const spinner = {
    start: () => spinner,
    stop: (...args: unknown[]) => mockSpinnerStop(...args),
  };
  return { default: () => spinner };
});

vi.mock('../../src/api/api-keys', () => ({
  createApiKey: (input: unknown) => mockCreateApiKey(input),
  listApiKeys: () => mockListApiKeys(),
  revokeApiKey: (id: string) => mockRevokeApiKey(id),
  rotateApiKey: (id: string) => mockRotateApiKey(id),
}));

vi.mock('../../src/api/client', () => ({
  requireAuth: () => mockRequireAuth(),
}));

vi.mock('../../src/ui/theme', () => ({
  formatHeader: (value: string) => value,
  formatLabel: (label: string, value: string) => `${label}: ${value}`,
  formatSuccess: (value: string) => value,
  formatWarning: (value: string) => value,
  print: (value?: unknown) => mockPrint(value),
  printJson: (value: unknown) => mockPrintJson(value),
}));

vi.mock('../../src/utils/errors', () => {
  return {
    GenfeedError: class GenfeedError extends Error {
      constructor(
        message: string,
        public readonly hint?: string
      ) {
        super(message);
      }
    },
    handleError: (error: unknown) => mockHandleError(error),
  };
});

describe('keys command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue('gf_test_auth');
    mockListApiKeys.mockResolvedValue([
      {
        id: 'key-1',
        label: 'MCP',
        lastUsedAt: null,
        scopes: ['videos:read'],
      },
    ]);
    mockCreateApiKey.mockResolvedValue({
      id: 'key-2',
      key: 'gf_test_created',
      label: 'MCP',
      scopes: ['videos:read'],
    });
    mockRevokeApiKey.mockResolvedValue({ id: 'key-1', isRevoked: true });
    mockRotateApiKey.mockResolvedValue({
      id: 'key-3',
      key: 'gf_test_rotated',
      label: 'MCP',
    });
  });

  it('prints API keys as JSON', async () => {
    await keysCommand.parseAsync(['list', '--json'], { from: 'user' });

    expect(mockRequireAuth).toHaveBeenCalled();
    expect(mockListApiKeys).toHaveBeenCalled();
    expect(mockPrintJson).toHaveBeenCalledWith({
      keys: [
        expect.objectContaining({
          id: 'key-1',
          label: 'MCP',
        }),
      ],
    });
  });

  it('creates a key with the MCP preset by default', async () => {
    await keysCommand.parseAsync(['create', '--name', 'MCP', '--json'], {
      from: 'user',
    });

    expect(mockCreateApiKey).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'MCP',
        scopes: expect.arrayContaining(['videos:read', 'analytics:read']),
      })
    );
    expect(mockPrintJson).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'gf_test_created',
      })
    );
  });

  it('revokes and rotates keys with force mode', async () => {
    await keysCommand.parseAsync(['revoke', 'key-1', '--force', '--json'], {
      from: 'user',
    });
    await keysCommand.parseAsync(['rotate', 'key-1', '--force', '--json'], {
      from: 'user',
    });

    expect(mockRevokeApiKey).toHaveBeenCalledWith('key-1');
    expect(mockRotateApiKey).toHaveBeenCalledWith('key-1');
    expect(mockPrintJson).toHaveBeenCalledWith({
      apiKey: { id: 'key-1', isRevoked: true },
      revoked: true,
    });
    expect(mockPrintJson).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'gf_test_rotated',
      })
    );
  });
});

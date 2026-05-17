import { beforeEach, describe, expect, it, vi } from 'vitest';
import { whoamiCommand } from '../../src/commands/whoami.js';
import { ApiError } from '../../src/utils/errors.js';

const {
  mockGetActiveBrand,
  mockGetBrand,
  mockHandleError,
  mockPrintJson,
  mockRequireAuth,
  mockWhoami,
} = vi.hoisted(() => ({
  mockGetActiveBrand: vi.fn(),
  mockGetBrand: vi.fn(),
  mockHandleError: vi.fn((error: unknown) => {
    throw error;
  }),
  mockPrintJson: vi.fn(),
  mockRequireAuth: vi.fn(),
  mockWhoami: vi.fn(),
}));

vi.mock('../../src/api/auth.js', () => ({
  whoami: () => mockWhoami(),
}));

vi.mock('../../src/api/brands.js', () => ({
  getBrand: (id: string) => mockGetBrand(id),
}));

vi.mock('../../src/api/client.js', () => ({
  requireAuth: () => mockRequireAuth(),
}));

vi.mock('../../src/config/store.js', () => ({
  getActiveBrand: () => mockGetActiveBrand(),
}));

vi.mock('../../src/ui/theme.js', () => ({
  formatLabel: (label: string, value: string) => `${label}: ${value}`,
  formatSuccess: (value: string) => value,
  print: vi.fn(),
  printJson: (value: unknown) => mockPrintJson(value),
}));

vi.mock('../../src/utils/errors.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/utils/errors.js')>();
  return {
    ...actual,
    handleError: (error: unknown) => mockHandleError(error),
  };
});

describe('whoami command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue('api-key');
    mockWhoami.mockResolvedValue({
      organization: { id: 'org-1', name: 'Org' },
      scopes: ['read'],
      user: { email: 'user@example.com', id: 'user-1', name: 'User' },
    });
    mockGetActiveBrand.mockResolvedValue('brand-1');
    mockGetBrand.mockResolvedValue({ id: 'brand-1', label: 'Brand' });
  });

  it('does not hide non-404 active brand lookup failures', async () => {
    const error = new ApiError('Access denied', 403);
    mockGetBrand.mockRejectedValue(error);

    await expect(whoamiCommand.parseAsync(['--json'], { from: 'user' })).rejects.toThrow(error);

    expect(mockHandleError).toHaveBeenCalledWith(error);
    expect(mockPrintJson).not.toHaveBeenCalled();
  });

  it('treats only a 404 active brand lookup as a missing brand', async () => {
    mockGetBrand.mockRejectedValue(new ApiError('Not found', 404));

    await whoamiCommand.parseAsync(['--json'], { from: 'user' });

    expect(mockPrintJson).toHaveBeenCalledWith(
      expect.objectContaining({
        activeBrand: null,
      })
    );
  });
});

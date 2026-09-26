import { beforeEach, describe, expect, it, vi } from 'vitest';
import { connectCommand } from '@/commands/connect';

const {
  mockExecuteAgentTool,
  mockOpenExternalUrl,
  mockPrint,
  mockRequireAuth,
  mockRequireGenerationBrand,
} = vi.hoisted(() => ({
  mockExecuteAgentTool: vi.fn(),
  mockOpenExternalUrl: vi.fn(),
  mockPrint: vi.fn(),
  mockRequireAuth: vi.fn(),
  mockRequireGenerationBrand: vi.fn(),
}));

vi.mock('@/api/agent-tools', () => ({
  executeAgentTool: (...args: unknown[]) => mockExecuteAgentTool(...args),
}));
vi.mock('@/api/client', () => ({ requireAuth: () => mockRequireAuth() }));
vi.mock('@/commands/generate/helpers', () => ({
  requireGenerationBrand: (brand?: string) => mockRequireGenerationBrand(brand),
}));
vi.mock('@/ui/theme', () => ({
  formatLabel: (label: string, value: string) => `${label}: ${value}`,
  formatSuccess: (value: string) => value,
  print: (value?: unknown) => mockPrint(value),
  printJson: vi.fn(),
}));
vi.mock('@/utils/browser', () => ({
  openExternalUrl: (url: string) => mockOpenExternalUrl(url),
}));
vi.mock('ora', () => {
  const spinner = {
    fail: vi.fn(),
    start: () => spinner,
    succeed: vi.fn(),
  };
  return { default: () => spinner };
});

describe('connect command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue('gf_test_key');
    mockRequireGenerationBrand.mockResolvedValue('brand-2');
    mockExecuteAgentTool.mockResolvedValue({
      data: {
        authorizationUrl: 'https://app.genfeed.ai/acme/~/connect/social?connectionId=cred-1',
        connectionId: 'cred-1',
        state: 'pending',
      },
      success: true,
    });
    mockOpenExternalUrl.mockResolvedValue(true);
  });

  it('opens the browser authorization URL without creating a second generation', async () => {
    await connectCommand.parseAsync(['twitter', '--no-wait'], { from: 'user' });

    expect(mockExecuteAgentTool).toHaveBeenCalledWith(
      'connect_social_account',
      { brandId: 'brand-2', platform: 'twitter' },
      expect.any(AbortSignal)
    );
    expect(mockOpenExternalUrl).toHaveBeenCalledWith(
      'https://app.genfeed.ai/acme/~/connect/social?connectionId=cred-1'
    );
    expect(mockPrint).toHaveBeenCalledWith(expect.stringContaining('cred-1'));
  });
});

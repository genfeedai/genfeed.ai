import { IngredientStatus, PersistedArticleStatus } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetArticle, mockGetImage, mockPrint, mockRequireAuth } = vi.hoisted(() => ({
  mockGetArticle: vi.fn(),
  mockGetImage: vi.fn(),
  mockPrint: vi.fn(),
  mockRequireAuth: vi.fn(),
}));

vi.mock('@/api/articles', () => ({ getArticle: (id: string) => mockGetArticle(id) }));
vi.mock('@/api/client', () => ({ requireAuth: () => mockRequireAuth() }));
vi.mock('@/api/images', () => ({ getImage: (id: string) => mockGetImage(id) }));
vi.mock('@/api/videos', () => ({ getVideo: vi.fn() }));
vi.mock('@/ui/theme', () => ({
  formatError: (value: string) => value,
  formatLabel: (label: string, value: string) => `${label}: ${value}`,
  print: (value?: unknown) => mockPrint(value),
  printJson: vi.fn(),
}));
vi.mock('ora', () => {
  const spinner = { start: () => spinner, stop: vi.fn() };
  return { default: () => spinner };
});

describe('status command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue('gf_test_key');
  });

  it('does not describe an article draft as active generation', async () => {
    mockGetArticle.mockResolvedValue({
      createdAt: '2026-08-28T00:00:00.000Z',
      id: 'article-1',
      label: 'Draft article',
      status: PersistedArticleStatus.DRAFT,
    });
    const { createStatusCommand } = await import('@/commands/status');

    await createStatusCommand().parseAsync(['article-1', '--type', 'article'], { from: 'user' });

    expect(mockPrint).not.toHaveBeenCalledWith(
      expect.stringContaining('Generation is still in progress')
    );
  });

  it('still describes a draft ingredient as pending generation', async () => {
    mockGetImage.mockResolvedValue({
      createdAt: '2026-08-28T00:00:00.000Z',
      id: 'image-1',
      model: 'flux-schnell',
      status: IngredientStatus.DRAFT,
    });
    const { createStatusCommand } = await import('@/commands/status');

    await createStatusCommand().parseAsync(['image-1'], { from: 'user' });

    expect(mockPrint).toHaveBeenCalledWith(
      expect.stringContaining('Generation is still in progress')
    );
  });
});

import { describe, expect, it, vi } from 'vitest';

vi.mock('@plasmohq/storage', () => ({
  Storage: class MockStorage {
    public get = vi.fn().mockResolvedValue(null);
    public set = vi.fn();
  },
}));

vi.mock('~components/ui', () => ({
  CloseIcon: () => null,
  EmptyState: () => null,
  ExternalLinkIcon: () => null,
  LoadingPage: () => null,
}));

vi.mock('~utils/logger.util', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));

describe('IdeasPage', () => {
  it('module can be imported', async () => {
    const mod = await import('~components/pages/IdeasPage');
    expect(mod).toBeDefined();
    expect(mod.default).toBeDefined();
  });
});

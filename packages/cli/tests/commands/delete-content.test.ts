import { beforeEach, describe, expect, it, vi } from 'vitest';
import { libraryCommand } from '../../src/commands/library';
import { postsCommand } from '../../src/commands/posts';

const state = vi.hoisted(() => ({
  assetDeletes: [] as string[],
  confirmAnswer: true,
  confirmAsked: [] as string[],
  json: [] as unknown[],
  lines: [] as unknown[],
  postDeletes: [] as {
    deleteOnPlatform: boolean | undefined;
    id: string;
    includeMedia: boolean | undefined;
  }[],
  removalAnswer: undefined as unknown,
}));

const removal = vi.hoisted(() => ({
  deletedOnPlatform: false,
  media: { deleted: ['asset-1'], kept: [{ id: 'asset-2', reason: 'used-by-another-post' }] },
  platform: 'instagram',
  platformDeletion: 'not-requested',
  postId: 'post-1',
  previousStatus: 'public',
  publishedUrl: 'https://www.instagram.com/p/abc/',
  verified: { mediaGone: true, postGone: true },
}));
vi.mock('@inquirer/prompts', () => ({
  confirm: async (input: { message: string }) => {
    state.confirmAsked.push(input.message);
    return state.confirmAnswer;
  },
}));
vi.mock('ora', () => {
  const spinner = { fail: vi.fn(), start: () => spinner, stop: vi.fn() };
  return { default: () => spinner };
});
vi.mock('../../src/api/client', () => ({ requireAuth: vi.fn().mockResolvedValue('gf_test') }));
vi.mock('../../src/api/posts', () => ({
  deletePost: async (
    id: string,
    options?: { deleteOnPlatform?: boolean; includeMedia?: boolean }
  ) => {
    state.postDeletes.push({
      deleteOnPlatform: options?.deleteOnPlatform,
      id,
      includeMedia: options?.includeMedia,
    });
    return state.removalAnswer ?? removal;
  },
  listPosts: vi.fn(),
}));
vi.mock('../../src/api/assets', () => ({
  deleteAsset: async (id: string) => {
    state.assetDeletes.push(id);
    return true;
  },
  getAsset: vi.fn(),
  listAssets: vi.fn(),
}));
vi.mock('../../src/operations/assets', () => ({ readAsset: vi.fn(), readAssets: vi.fn() }));
vi.mock('../../src/commands/generate/helpers', () => ({ downloadGeneratedFile: vi.fn() }));
vi.mock('../../src/ui/theme', () => ({
  formatHeader: (value: string) => value,
  formatLabel: (label: string, value: string) => `${label}: ${value}`,
  formatSuccess: (value: string) => value,
  formatWarning: (value: string) => value,
  print: (value?: unknown) => state.lines.push(value),
  printJson: (value: unknown) => state.json.push(value),
}));
vi.mock('../../src/utils/errors', () => ({
  GenfeedError: class GenfeedError extends Error {},
  handleError: (error: unknown) => {
    throw error;
  },
}));

describe('delete commands', () => {
  beforeEach(() => {
    state.assetDeletes.length = 0;
    state.confirmAnswer = true;
    state.confirmAsked.length = 0;
    state.json.length = 0;
    state.lines.length = 0;
    state.postDeletes.length = 0;
    state.removalAnswer = undefined;
  });

  it('deletes nothing when the person declines the post confirmation', async () => {
    state.confirmAnswer = false;

    await postsCommand.parseAsync(['delete', 'post-1', '--with-media'], { from: 'user' });

    expect(state.postDeletes).toEqual([]);
    expect(state.lines).toEqual(['Delete cancelled']);
    expect(state.confirmAsked[0]).toContain('stays live on its network');
  });

  it('deletes the post with its media and says the network copy stays live', async () => {
    await postsCommand.parseAsync(['delete', 'post-1', '--with-media', '--force'], {
      from: 'user',
    });

    expect(state.confirmAsked).toEqual([]);
    expect(state.postDeletes).toEqual([
      { deleteOnPlatform: false, id: 'post-1', includeMedia: true },
    ]);
    expect(state.lines).toEqual([
      'Post deleted from Genfeed',
      'ID: post-1',
      'Was: public',
      'Media deleted: 1',
      'Media kept: asset-2 (used-by-another-post)',
      'Still live on instagram: https://www.instagram.com/p/abc/',
    ]);
  });

  it('deletes on the social network too with --on-platform and says so', async () => {
    state.removalAnswer = {
      ...removal,
      deletedOnPlatform: true,
      platform: 'twitter',
      platformDeletion: 'deleted',
      publishedUrl: 'https://x.com/a/status/1',
    };

    await postsCommand.parseAsync(['delete', 'post-1', '--on-platform'], { from: 'user' });

    expect(state.confirmAsked[0]).toContain('also deleted on its social network');
    expect(state.postDeletes).toEqual([
      { deleteOnPlatform: true, id: 'post-1', includeMedia: false },
    ]);
    expect(state.lines).toContain('Deleted on: twitter');
    expect(state.lines.join('\n')).not.toContain('Still live');
  });

  it('prints the removal as JSON', async () => {
    await postsCommand.parseAsync(['delete', 'post-1', '--force', '--json'], { from: 'user' });

    expect(state.json).toEqual([removal]);
  });

  it('deletes an asset after confirmation and reports the read-back', async () => {
    await libraryCommand.parseAsync(['delete', 'asset-1'], { from: 'user' });

    expect(state.assetDeletes).toEqual(['asset-1']);
    expect(state.lines).toEqual(['Asset deleted', 'ID: asset-1']);
  });
});

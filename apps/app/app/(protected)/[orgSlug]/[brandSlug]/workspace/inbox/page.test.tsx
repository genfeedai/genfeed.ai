import WorkspaceInboxPage, * as PageModule from '@app/(protected)/[orgSlug]/[brandSlug]/workspace/inbox/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({
  permanentRedirect: vi.fn((destination: string) => {
    throw new Error(`PERMANENT:${destination}`);
  }),
  redirect: vi.fn((destination: string) => {
    throw new Error(`TEMPORARY:${destination}`);
  }),
}));
vi.mock('next/navigation', () => ({
  permanentRedirect: navigation.permanentRedirect,
  redirect: navigation.redirect,
}));

runPageModuleTests('app/(protected)/workspace/inbox/page', PageModule);

async function openInbox(search: Record<string, string | string[]>) {
  return WorkspaceInboxPage({
    params: Promise.resolve({ brandSlug: 'moon', orgSlug: 'acme' }),
    searchParams: Promise.resolve(search),
  });
}

describe('WorkspaceInboxPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('opens the unread view for the bare inbox', async () => {
    await expect(openInbox({})).rejects.toThrow(
      'TEMPORARY:/acme/moon/workspace/inbox/unread',
    );
  });

  it('keeps filters when opening the unread view', async () => {
    await expect(openInbox({ taskId: 't1' })).rejects.toThrow(
      'TEMPORARY:/acme/moon/workspace/inbox/unread?taskId=t1',
    );
  });

  it.each(['all', 'recent', 'unread'])(
    'permanently moves the legacy ?view=%s link to its path',
    async (view) => {
      await expect(openInbox({ taskId: 't1', view })).rejects.toThrow(
        `PERMANENT:/acme/moon/workspace/inbox/${view}?taskId=t1`,
      );
    },
  );

  it.each([{ view: 'nope' }, { view: ['all', 'recent'] }])(
    'falls back to unread for the unusable view %j',
    async (search) => {
      await expect(openInbox(search)).rejects.toThrow(
        'PERMANENT:/acme/moon/workspace/inbox/unread',
      );
    },
  );
});

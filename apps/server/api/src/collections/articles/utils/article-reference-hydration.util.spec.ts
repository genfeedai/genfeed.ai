import {
  type ArticleReferenceHydrationPorts,
  hydrateArticleReferences,
} from '@api/collections/articles/utils/article-reference-hydration.util';
import { describe, expect, it, vi } from 'vitest';

function ports() {
  return {
    organizationsService: { findAll: vi.fn().mockResolvedValue({ docs: [] }) },
    usersService: { findAll: vi.fn().mockResolvedValue({ docs: [] }) },
  } satisfies ArticleReferenceHydrationPorts;
}

describe('article reference hydration', () => {
  it('skips empty inputs and missing reference ids', async () => {
    const deps = ports();
    await hydrateArticleReferences([], deps);
    await hydrateArticleReferences(
      [{ userId: null }, { organizationId: '' }],
      deps,
    );
    expect(deps.usersService.findAll).not.toHaveBeenCalled();
    expect(deps.organizationsService.findAll).not.toHaveBeenCalled();
  });
  it('deduplicates ids and attaches only matching live reference results', async () => {
    const deps = ports();
    const user = { id: 'user-1', name: 'Synthetic User' };
    const organization = { id: 'org-1', name: 'Synthetic Org' };
    deps.usersService.findAll.mockResolvedValue({ docs: [user] });
    deps.organizationsService.findAll.mockResolvedValue({
      docs: [organization],
    });
    const docs: Array<Record<string, unknown>> = [
      { id: 'a', organizationId: 'org-1', userId: 'user-1' },
      { id: 'b', organizationId: 'org-1', userId: 'user-1' },
      { id: 'c', userId: 'missing' },
    ];
    await hydrateArticleReferences(docs, deps);
    expect(deps.usersService.findAll).toHaveBeenCalledWith(
      { where: { id: { in: ['user-1', 'missing'] }, isDeleted: false } },
      { pagination: false },
    );
    expect(deps.organizationsService.findAll).toHaveBeenCalledWith(
      { where: { id: { in: ['org-1'] }, isDeleted: false } },
      { pagination: false },
    );
    expect(docs[0].user).toBe(user);
    expect(docs[1].user).toBe(user);
    expect(docs[0].organization).toBe(organization);
    expect(docs[2]).toEqual({ id: 'c', userId: 'missing' });
  });
  it('retains id stringification and the last matching lookup result', async () => {
    const deps = ports();
    const last = { id: 'user-1', name: 'Latest row' };
    deps.usersService.findAll.mockResolvedValue({
      docs: [{ id: 'user-1', name: 'First row' }, last],
    });
    const docs: Array<Record<string, unknown>> = [
      { userId: { toString: () => 'user-1' } },
    ];
    await hydrateArticleReferences(docs, deps);
    expect(deps.usersService.findAll).toHaveBeenCalledWith(
      { where: { id: { in: ['user-1'] }, isDeleted: false } },
      { pagination: false },
    );
    expect(docs[0].user).toBe(last);
  });
  it('does not erase already-present references when no row matches', async () => {
    const deps = ports();
    const user = { label: 'Existing user' };
    const organization = { label: 'Existing organization' };
    const docs: Array<Record<string, unknown>> = [
      {
        organization,
        organizationId: 'missing-org',
        user,
        userId: 'missing-user',
      },
    ];
    await hydrateArticleReferences(docs, deps);
    expect(docs[0].user).toBe(user);
    expect(docs[0].organization).toBe(organization);
  });
  it('supports absent lookup services without mutating the documents', async () => {
    const docs = [{ organizationId: 'org-1', userId: 'user-1' }];
    await hydrateArticleReferences(docs, {});
    expect(docs).toEqual([{ organizationId: 'org-1', userId: 'user-1' }]);
  });
  it('propagates lookup errors without partially hydrating', async () => {
    const deps = ports();
    const error = new Error('synthetic lookup failure');
    deps.usersService.findAll.mockRejectedValue(error);
    deps.organizationsService.findAll.mockResolvedValue({
      docs: [{ id: 'org-1' }],
    });
    const docs = [{ organizationId: 'org-1', userId: 'user-1' }];
    await expect(hydrateArticleReferences(docs, deps)).rejects.toBe(error);
    expect(docs).toEqual([{ organizationId: 'org-1', userId: 'user-1' }]);
  });
});

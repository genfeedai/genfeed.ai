import { describe, expect, it } from 'vitest';
import {
  API_KEY_PERMISSION_GROUPS,
  getSelfServiceApiKeyPermissionLevels,
  isApiKeyPermissionLevelOffered,
  PARTNER_API_KEY_PERMISSION_LEVELS,
  resolveApiKeyPermissionLevels,
  resolveApiKeyPermissionScopes,
} from './api-key-permissions.constant';
import {
  API_KEY_SCOPE_PRESETS,
  SELF_SERVICE_API_KEY_SCOPES,
} from './api-key-presets.constant';

const RESOURCES = API_KEY_PERMISSION_GROUPS.flatMap((group) => group.resources);

function resource(id: string) {
  const found = RESOURCES.find((entry) => entry.id === id);
  if (!found) throw new Error(`Unknown resource ${id}`);
  return found;
}

describe('API key permission registry', () => {
  it.each([
    [{ images: 'read' }, ['images:read']],
    [
      { images: 'write' },
      ['images:read', 'images:create', 'images:update', 'images:delete'],
    ],
    [{ images: 'none', videos: 'none' }, []],
    [{ 'post-drafts': 'write' }, ['posts:draft']],
    [{ brands: 'write' }, ['brands:read', 'brands:write']],
    [{ analytics: 'write' }, []],
    [{ 'post-drafts': 'read' }, []],
    [{ nonexistent: 'write' }, []],
  ] as const)('maps %j to %j', (levels, expected) => {
    expect(resolveApiKeyPermissionScopes(levels)).toEqual(expected);
  });

  it('keeps privileged scopes out of the editor', () => {
    const all = API_KEY_PERMISSION_GROUPS.flatMap((group) =>
      group.resources.flatMap((resource) => [
        ...resource.readScopes,
        ...resource.writeScopes,
      ]),
    );

    expect(all).not.toContain('admin');
    expect(all).not.toContain('credits:provision');
    expect(all).not.toContain('managed-inference:execute');
  });

  it.each([
    ['brands', ['none', 'read']],
    ['videos', ['none', 'read', 'write']],
    ['images', ['none', 'read', 'write']],
    ['post-drafts', ['none', 'write']],
    ['analytics', ['none', 'read']],
  ] as const)('offers %s at %j in the self-service editor', (id, expected) => {
    expect(getSelfServiceApiKeyPermissionLevels(resource(id))).toEqual(
      expected,
    );
  });

  it('keeps Brands Write out of the self-service scopes', () => {
    expect(SELF_SERVICE_API_KEY_SCOPES).not.toContain('brands:write');
  });

  it('shows the read preset as Read on every readable resource', () => {
    expect(resolveApiKeyPermissionLevels(API_KEY_SCOPE_PRESETS.read)).toEqual({
      analytics: 'read',
      articles: 'read',
      brands: 'read',
      credits: 'read',
      'direct-publishing': 'none',
      images: 'read',
      'post-drafts': 'none',
      'post-scheduling': 'none',
      prompts: 'read',
      'publish-approvals': 'none',
      videos: 'read',
    });
  });

  it('shows the content preset as Write on content and post drafts', () => {
    expect(
      resolveApiKeyPermissionLevels(API_KEY_SCOPE_PRESETS.content),
    ).toEqual({
      analytics: 'none',
      articles: 'write',
      brands: 'none',
      credits: 'none',
      'direct-publishing': 'none',
      images: 'write',
      'post-drafts': 'write',
      'post-scheduling': 'none',
      prompts: 'write',
      'publish-approvals': 'none',
      videos: 'write',
    });
  });

  it('grants a partner key image generation and brand context only', () => {
    expect(
      resolveApiKeyPermissionScopes(PARTNER_API_KEY_PERMISSION_LEVELS),
    ).toEqual([
      'images:read',
      'images:create',
      'images:update',
      'images:delete',
      'brands:read',
      'brands:write',
    ]);
  });

  it.each([
    ['images', 'write', true],
    ['analytics', 'write', false],
    ['post-drafts', 'read', false],
    ['nonexistent', 'read', false],
  ] as const)('reports whether %s offers %s', (id, level, expected) => {
    expect(isApiKeyPermissionLevelOffered(id, level)).toBe(expected);
  });
});

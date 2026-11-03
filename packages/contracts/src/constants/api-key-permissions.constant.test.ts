import { describe, expect, it } from 'vitest';
import {
  API_KEY_PERMISSION_GROUPS,
  resolveApiKeyPermissionScopes,
} from './api-key-permissions.constant';
import { SELF_SERVICE_API_KEY_SCOPES } from './api-key-presets.constant';

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

  it('marks every scope outside the self-service list as not self-service', () => {
    const notSelfService = API_KEY_PERMISSION_GROUPS.flatMap((group) =>
      group.resources.filter((resource) => !resource.isSelfService),
    ).map((resource) => resource.id);

    expect(notSelfService).toEqual(['brands']);
    expect(SELF_SERVICE_API_KEY_SCOPES).not.toContain('brands:write');
  });
});

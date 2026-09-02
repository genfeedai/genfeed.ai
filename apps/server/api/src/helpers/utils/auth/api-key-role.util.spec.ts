import { ApiKeyScope, MemberRole } from '@genfeedai/contracts';
import { resolveApiKeyEffectiveMemberRole } from './api-key-role.util';

describe('resolveApiKeyEffectiveMemberRole', () => {
  it('leaves session users unchanged', () => {
    expect(
      resolveApiKeyEffectiveMemberRole(
        { isApiKey: false, scopes: [] },
        MemberRole.OWNER,
      ),
    ).toBe(MemberRole.OWNER);
    expect(resolveApiKeyEffectiveMemberRole({}, MemberRole.ADMIN)).toBe(
      MemberRole.ADMIN,
    );
  });

  it('does not let an owner-issued key inherit org-admin without an admin scope', () => {
    expect(
      resolveApiKeyEffectiveMemberRole(
        { isApiKey: true, scopes: [ApiKeyScope.VIDEOS_READ] },
        MemberRole.OWNER,
      ),
    ).toBe(MemberRole.USER);
    expect(
      resolveApiKeyEffectiveMemberRole(
        { isApiKey: true, scopes: ['*'] },
        MemberRole.ADMIN,
      ),
    ).toBe(MemberRole.USER);
  });

  it('keeps explicit admin-scoped keys at the issuer membership role', () => {
    expect(
      resolveApiKeyEffectiveMemberRole(
        { isApiKey: true, scopes: [ApiKeyScope.ADMIN] },
        MemberRole.OWNER,
      ),
    ).toBe(MemberRole.OWNER);
  });

  it('never elevates a non-admin issuer even with an admin scope', () => {
    expect(
      resolveApiKeyEffectiveMemberRole(
        { isApiKey: true, scopes: [ApiKeyScope.ADMIN] },
        MemberRole.CREATOR,
      ),
    ).toBe(MemberRole.CREATOR);
  });
});

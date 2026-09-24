import { describe, expect, it } from 'vitest';

import {
  CLOSED_SKILL_SOURCE_POLICY,
  PUBLIC_FREE_SOURCE_POLICY,
  resolveSkillCapabilities,
  type SkillCapabilityActor,
  type SkillCapabilitySubject,
} from './skill-capabilities';

const owner: SkillCapabilityActor = {
  userId: 'user-owner',
  organizationId: 'org-a',
  brandId: 'brand-a',
  isOrganizationAdmin: false,
  isBrandAdmin: false,
};

const otherMember: SkillCapabilityActor = {
  ...owner,
  userId: 'user-other',
};

const orgAdmin: SkillCapabilityActor = {
  ...otherMember,
  isOrganizationAdmin: true,
  isBrandAdmin: true,
};

const personal: SkillCapabilitySubject = {
  ownerKind: 'user',
  ownerUserId: 'user-owner',
  organizationId: null,
  brandId: null,
  audience: 'private',
  isQuarantined: false,
  hasPublishedVersion: false,
};

const privateOrg: SkillCapabilitySubject = {
  ownerKind: 'organization',
  ownerUserId: null,
  organizationId: 'org-a',
  brandId: null,
  audience: 'private',
  isQuarantined: false,
  hasPublishedVersion: false,
};

describe('resolveSkillCapabilities', () => {
  it('lets the personal owner use and read without exposing the skill to another member', () => {
    const owned = resolveSkillCapabilities(
      personal,
      owner,
      [],
      PUBLIC_FREE_SOURCE_POLICY,
    );
    const hidden = resolveSkillCapabilities(
      personal,
      otherMember,
      [],
      PUBLIC_FREE_SOURCE_POLICY,
    );

    expect(owned.canUse).toBe(true);
    expect(owned.canRead).toBe(true);
    expect(owned.canEdit).toBe(true);
    expect(hidden).toMatchObject({
      canUse: false,
      canRead: false,
      canEdit: false,
      canExport: false,
    });
  });

  it('does not let an organization admin read another user personal skill', () => {
    const capabilities = resolveSkillCapabilities(
      personal,
      orgAdmin,
      [],
      PUBLIC_FREE_SOURCE_POLICY,
    );

    expect(capabilities.canRead).toBe(false);
    expect(capabilities.canUse).toBe(false);
  });

  it('lets an organization admin govern a private organization skill and hides it from members', () => {
    const admin = resolveSkillCapabilities(
      privateOrg,
      orgAdmin,
      [],
      PUBLIC_FREE_SOURCE_POLICY,
    );
    const member = resolveSkillCapabilities(
      privateOrg,
      otherMember,
      [],
      PUBLIC_FREE_SOURCE_POLICY,
    );

    expect(admin.canEdit).toBe(true);
    expect(admin.canPublish).toBe(true);
    expect(member.canUse).toBe(false);
    expect(member.canRead).toBe(false);
  });

  it('keeps a use grant from becoming read, edit, or share', () => {
    const capabilities = resolveSkillCapabilities(
      personal,
      otherMember,
      [
        {
          access: 'use',
          recipientKind: 'user',
          recipientUserId: 'user-other',
          recipientOrganizationId: null,
          recipientBrandId: null,
          isRevoked: false,
        },
      ],
      PUBLIC_FREE_SOURCE_POLICY,
    );

    expect(capabilities.canUse).toBe(true);
    expect(capabilities.canRead).toBe(false);
    expect(capabilities.canEdit).toBe(false);
    expect(capabilities.canShare).toBe(false);
    expect(capabilities.canFork).toBe(false);
  });

  it('drops a revoked grant and still refuses export when the source policy is closed', () => {
    const capabilities = resolveSkillCapabilities(
      personal,
      otherMember,
      [
        {
          access: 'use_and_read',
          recipientKind: 'user',
          recipientUserId: 'user-other',
          recipientOrganizationId: null,
          recipientBrandId: null,
          isRevoked: true,
        },
      ],
      CLOSED_SKILL_SOURCE_POLICY,
    );

    expect(capabilities.canUse).toBe(false);
    expect(capabilities.canRead).toBe(false);
    expect(capabilities.canExport).toBe(false);
  });

  it('allows read of a public free snapshot and still withholds derivatives', () => {
    const capabilities = resolveSkillCapabilities(
      {
        ...personal,
        audience: 'public',
        hasPublishedVersion: true,
      },
      otherMember,
      [],
      PUBLIC_FREE_SOURCE_POLICY,
    );

    expect(capabilities.canRead).toBe(true);
    expect(capabilities.canUse).toBe(true);
    expect(capabilities.canFork).toBe(false);
    expect(capabilities.canPublish).toBe(false);
  });

  it('lets a member use a system catalog skill without governing it', () => {
    const capabilities = resolveSkillCapabilities(
      {
        ...personal,
        audience: 'private',
        ownerKind: 'system',
        ownerUserId: null,
      },
      otherMember,
      [],
      PUBLIC_FREE_SOURCE_POLICY,
    );

    expect(capabilities.canUse).toBe(true);
    expect(capabilities.canRead).toBe(true);
    expect(capabilities.canEdit).toBe(false);
    expect(capabilities.canShare).toBe(false);
  });

  it('lets the owner read a closed-license skill without granting export', () => {
    const capabilities = resolveSkillCapabilities(
      personal,
      owner,
      [],
      CLOSED_SKILL_SOURCE_POLICY,
    );

    expect(capabilities.canRead).toBe(true);
    expect(capabilities.canEdit).toBe(true);
    expect(capabilities.canExport).toBe(true);
    expect(capabilities.canShare).toBe(false);
    expect(capabilities.canPublish).toBe(false);
  });

  it('blocks every capability for a quarantined row', () => {
    const capabilities = resolveSkillCapabilities(
      { ...privateOrg, isQuarantined: true, ownerKind: null },
      orgAdmin,
      [],
      PUBLIC_FREE_SOURCE_POLICY,
    );

    expect(capabilities).toEqual({
      canUse: false,
      canRead: false,
      canEdit: false,
      canShare: false,
      canPublish: false,
      canFork: false,
      canExport: false,
    });
  });

  it('applies a grant only when the recipient kind and actor match', () => {
    const grant = (
      recipientKind: 'user' | 'organization' | 'brand',
      access: 'use' | 'use_and_read',
      recipient: {
        recipientBrandId?: string | null;
        recipientOrganizationId?: string | null;
        recipientUserId?: string | null;
      },
    ) =>
      resolveSkillCapabilities(
        privateOrg,
        otherMember,
        [
          {
            access,
            isRevoked: false,
            recipientBrandId: recipient.recipientBrandId ?? null,
            recipientKind,
            recipientOrganizationId: recipient.recipientOrganizationId ?? null,
            recipientUserId: recipient.recipientUserId ?? null,
          },
        ],
        CLOSED_SKILL_SOURCE_POLICY,
      );

    expect(
      grant('user', 'use_and_read', { recipientUserId: 'user-other' }),
    ).toMatchObject({ canRead: true, canUse: true, canEdit: false });
    expect(
      grant('user', 'use', { recipientUserId: 'user-other' }),
    ).toMatchObject({ canRead: false, canUse: true });
    expect(
      grant('user', 'use_and_read', { recipientUserId: 'user-owner' }),
    ).toMatchObject({ canRead: false, canUse: false });
    expect(
      grant('organization', 'use_and_read', {
        recipientOrganizationId: 'org-a',
      }),
    ).toMatchObject({ canRead: true, canUse: true });
    expect(
      grant('organization', 'use', { recipientOrganizationId: 'org-other' }),
    ).toMatchObject({ canRead: false, canUse: false });
    expect(
      grant('brand', 'use_and_read', {
        recipientBrandId: 'brand-a',
        recipientOrganizationId: 'org-a',
      }),
    ).toMatchObject({ canRead: true, canUse: true });
    expect(
      grant('brand', 'use', {
        recipientBrandId: 'brand-b',
        recipientOrganizationId: 'org-a',
      }),
    ).toMatchObject({ canRead: false, canUse: false });
  });
});

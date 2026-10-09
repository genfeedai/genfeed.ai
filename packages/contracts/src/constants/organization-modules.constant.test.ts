import { describe, expect, it } from 'vitest';
import {
  ORGANIZATION_MODULE_IDS,
  type OrganizationModuleAccessInput,
  organizationModuleOverridesSchema,
  resolveOrganizationModuleAccess,
  resolveOrganizationModulePreferences,
  resolveOrganizationModulePresentationAccess,
} from './organization-modules.constant';

const cloud: OrganizationModuleAccessInput = {
  moduleId: 'playground',
  moduleOverrides: {},
  isSettingsLoaded: true,
  hasOrganizationBilling: true,
  hasPaidSubscription: false,
  operation: 'write',
};

describe('organization module preference display', () => {
  it('resolves the settled server defaults independently of subscription eligibility', () => {
    expect(
      resolveOrganizationModulePreferences({
        hasOrganizationBilling: true,
        moduleOverrides: {},
      }),
    ).toEqual({
      playground: true,
      storyboard: true,
      publishing: true,
      analytics: true,
      motion: false,
      clips: false,
      batch: false,
      editor: false,
      automation: false,
      messages: false,
      discovery: true,
    });
  });
  it('keeps explicit self-hosted choices and leaves subscription granting to admission', () => {
    const preferences = resolveOrganizationModulePreferences({
      hasOrganizationBilling: false,
      moduleOverrides: { clips: false, automation: true },
    });
    expect(preferences?.clips).toBe(false);
    expect(preferences?.motion).toBe(true);
    expect(preferences?.automation).toBe(true);
    expect(
      resolveOrganizationModuleAccess({
        ...cloud,
        moduleId: 'automation',
        moduleOverrides: { automation: true },
      }).reason,
    ).toBe('subscription-required');
  });
  it.each([
    null,
    undefined,
    {},
    { hasOrganizationBilling: 'true', moduleOverrides: {} },
    { hasOrganizationBilling: true, moduleOverrides: { clips: 'true' } },
  ])(
    'does not guess a preference snapshot from unavailable data: %j',
    (settings) => {
      expect(resolveOrganizationModulePreferences(settings)).toBeNull();
    },
  );
});

describe('organization module access', () => {
  it.each(['playground', 'storyboard', 'publishing', 'analytics'] as const)(
    'keeps %s accessible without a subscription',
    (moduleId) => {
      expect(
        resolveOrganizationModuleAccess({ ...cloud, moduleId }).isAllowed,
      ).toBe(true);
    },
  );
  it.each([
    'motion',
    'clips',
    'batch',
    'editor',
    'automation',
    'messages',
  ] as const)('defaults %s off even on a paid plan', (moduleId) => {
    expect(
      resolveOrganizationModuleAccess({
        ...cloud,
        moduleId,
        hasPaidSubscription: true,
      }),
    ).toEqual({ isAllowed: false, reason: 'disabled' });
  });
  it('defaults Discovery on but requires a paid subscription', () => {
    expect(
      resolveOrganizationModuleAccess({ ...cloud, moduleId: 'discovery' }),
    ).toEqual({ isAllowed: false, reason: 'subscription-required' });
    expect(
      resolveOrganizationModuleAccess({
        ...cloud,
        moduleId: 'discovery',
        hasPaidSubscription: true,
      }).isAllowed,
    ).toBe(true);
  });
  it.each(['automation', 'messages', 'discovery'] as const)(
    'never treats an enabled %s toggle as a subscription grant',
    (moduleId) => {
      const input = {
        ...cloud,
        moduleId,
        moduleOverrides: { [moduleId]: true },
      };
      expect(resolveOrganizationModuleAccess(input).reason).toBe(
        'subscription-required',
      );
      expect(
        resolveOrganizationModuleAccess({ ...input, hasPaidSubscription: null })
          .reason,
      ).toBe('unavailable');
      expect(
        resolveOrganizationModuleAccess({ ...input, hasPaidSubscription: true })
          .isAllowed,
      ).toBe(true);
    },
  );
  it.each(ORGANIZATION_MODULE_IDS)(
    'preserves existing %s reads and exports when disabled or entitlement is unknown',
    (moduleId) => {
      for (const operation of ['read', 'export'] as const) {
        expect(
          resolveOrganizationModuleAccess({
            ...cloud,
            moduleId,
            isSettingsLoaded: false,
            hasPaidSubscription: null,
            moduleOverrides: null,
            operation,
          }).isAllowed,
        ).toBe(true);
      }
    },
  );
  it('blocks new work when settings are unresolved or persisted preferences are malformed', () => {
    expect(
      resolveOrganizationModuleAccess({ ...cloud, isSettingsLoaded: false })
        .reason,
    ).toBe('unavailable');
    for (const moduleOverrides of [
      null,
      [],
      'on',
      { batch: 'true' },
      { unknown: true },
    ]) {
      expect(
        resolveOrganizationModuleAccess({ ...cloud, moduleOverrides }).reason,
      ).toBe('unavailable');
    }
  });
  it.each(ORGANIZATION_MODULE_IDS)(
    'preserves self-hosted %s access without organization billing',
    (moduleId) => {
      expect(
        resolveOrganizationModuleAccess({
          ...cloud,
          moduleId,
          hasOrganizationBilling: false,
          hasPaidSubscription: null,
        }).isAllowed,
      ).toBe(true);
    },
  );
  it('honors explicit self-hosted disable preferences and allows enabling credit-based surfaces', () => {
    expect(
      resolveOrganizationModuleAccess({
        ...cloud,
        moduleId: 'batch',
        hasOrganizationBilling: false,
        moduleOverrides: { batch: false },
      }).reason,
    ).toBe('disabled');
    expect(
      resolveOrganizationModuleAccess({
        ...cloud,
        moduleId: 'batch',
        moduleOverrides: { batch: true },
      }).isAllowed,
    ).toBe(true);
  });
  it('rejects unknown module IDs, credit-only module overrides, nulls and coercion on writes', () => {
    for (const candidate of [
      null,
      [],
      { playground: false },
      { storyboard: false },
      { typo: true },
      { batch: 1 },
      { clips: null },
    ]) {
      expect(
        organizationModuleOverridesSchema.safeParse(candidate).success,
      ).toBe(false);
    }
    expect(
      organizationModuleOverridesSchema.parse({
        automation: true,
        batch: false,
      }),
    ).toEqual({ automation: true, batch: false });
  });
});

describe('readonly module creation presentation', () => {
  it.each(['automation', 'messages', 'discovery'] as const)(
    'requires a verified paid grant for %s even when enabled',
    (moduleId) => {
      const settings = {
        hasOrganizationBilling: true,
        moduleOverrides: { [moduleId]: true },
      };
      expect(
        resolveOrganizationModulePresentationAccess(settings, moduleId),
      ).toEqual({ isAllowed: false, reason: 'unavailable' });
      expect(
        resolveOrganizationModulePresentationAccess(
          { ...settings, hasPaidModuleSubscription: false },
          moduleId,
        ),
      ).toEqual({ isAllowed: false, reason: 'subscription-required' });
      expect(
        resolveOrganizationModulePresentationAccess(
          { ...settings, hasPaidModuleSubscription: true },
          moduleId,
        ),
      ).toEqual({ isAllowed: true, reason: null });
    },
  );
  it('does not accept malformed paid eligibility', () => {
    expect(
      resolveOrganizationModulePresentationAccess(
        {
          hasOrganizationBilling: true,
          moduleOverrides: {},
          hasPaidModuleSubscription: 'true',
        },
        'discovery',
      ),
    ).toEqual({ isAllowed: false, reason: 'unavailable' });
  });
  it('never lets paid eligibility override a disabled module', () => {
    expect(
      resolveOrganizationModulePresentationAccess(
        {
          hasOrganizationBilling: true,
          moduleOverrides: { discovery: false },
          hasPaidModuleSubscription: true,
        },
        'discovery',
      ),
    ).toEqual({ isAllowed: false, reason: 'disabled' });
  });
  it('preserves self-hosted and credit-based work without a paid grant', () => {
    expect(
      resolveOrganizationModulePresentationAccess(
        { hasOrganizationBilling: false, moduleOverrides: {} },
        'automation',
      ),
    ).toEqual({ isAllowed: true, reason: null });
    expect(
      resolveOrganizationModulePresentationAccess(
        { hasOrganizationBilling: true, moduleOverrides: {} },
        'playground',
      ),
    ).toEqual({ isAllowed: true, reason: null });
  });
});

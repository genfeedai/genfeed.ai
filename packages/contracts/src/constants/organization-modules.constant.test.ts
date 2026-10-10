import { describe, expect, it } from 'vitest';
import {
  findNewlyEnabledUnreleasedModules,
  isReleasePreviewActive,
  ORGANIZATION_MODULE_IDS,
  ORGANIZATION_MODULES,
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
  // A release-preview organization, so founder-only modules follow their own
  // module rules; the unreleased path is asserted on its own below.
  isReleasePreviewEnabled: true,
  operation: 'write',
};

const FOUNDER_ONLY_MODULE_IDS = [
  'motion',
  'clips',
  'editor',
  'automation',
  'messages',
] as const;

describe('founder-only release gate (#5502)', () => {
  it('marks exactly the unreleased specialist modules founder-only', () => {
    expect(
      ORGANIZATION_MODULE_IDS.filter(
        (moduleId) => ORGANIZATION_MODULES[moduleId].isFounderOnly,
      ),
    ).toEqual(FOUNDER_ONLY_MODULE_IDS);
  });

  it.each(FOUNDER_ONLY_MODULE_IDS)(
    'refuses new %s work on cloud outside release preview, even when enabled and paid',
    (moduleId) => {
      expect(
        resolveOrganizationModuleAccess({
          ...cloud,
          moduleId,
          moduleOverrides: { [moduleId]: true },
          hasPaidSubscription: true,
          isReleasePreviewEnabled: false,
        }),
      ).toEqual({ isAllowed: false, reason: 'unreleased' });
    },
  );

  it('keeps reads, exports and cancellation of unreleased modules available', () => {
    for (const operation of ['read', 'export', 'cancel'] as const) {
      expect(
        resolveOrganizationModuleAccess({
          ...cloud,
          moduleId: 'automation',
          isReleasePreviewEnabled: false,
          operation,
        }),
      ).toEqual({ isAllowed: true, reason: null });
    }
  });

  it('admits founder-only work in a release-preview organization by its own rules', () => {
    expect(
      resolveOrganizationModuleAccess({
        ...cloud,
        moduleId: 'automation',
        moduleOverrides: { automation: true },
        hasPaidSubscription: true,
      }),
    ).toEqual({ isAllowed: true, reason: null });
  });

  it('leaves self-hosted deployments without the release gate', () => {
    expect(
      resolveOrganizationModuleAccess({
        ...cloud,
        moduleId: 'motion',
        hasOrganizationBilling: false,
        isReleasePreviewEnabled: false,
      }),
    ).toEqual({ isAllowed: true, reason: null });
  });

  it('never releases released modules through the gate', () => {
    expect(
      resolveOrganizationModuleAccess({
        ...cloud,
        moduleId: 'playground',
        isReleasePreviewEnabled: false,
      }),
    ).toEqual({ isAllowed: true, reason: null });
  });

  it('hides unreleased modules from cloud navigation without preview', () => {
    const preferences = resolveOrganizationModulePreferences({
      hasOrganizationBilling: true,
      moduleOverrides: { clips: true, automation: true, batch: true },
    });
    expect(preferences?.clips).toBe(false);
    expect(preferences?.automation).toBe(false);
    expect(preferences?.batch).toBe(true);
    expect(
      resolveOrganizationModulePreferences({
        hasOrganizationBilling: true,
        isReleasePreviewEnabled: true,
        moduleOverrides: { clips: true },
      })?.clips,
    ).toBe(true);
    expect(
      resolveOrganizationModulePresentationAccess(
        { hasOrganizationBilling: true, moduleOverrides: { clips: true } },
        'clips',
      ),
    ).toEqual({ isAllowed: false, reason: 'unreleased' });
  });
});

describe('newly enabled unreleased modules (#5502)', () => {
  const base = {
    hasOrganizationBilling: true,
    isReleasePreviewEnabled: false,
    previousOverrides: { motion: false, batch: false },
  };

  it('reports founder-only modules switched from off to on', () => {
    expect(
      findNewlyEnabledUnreleasedModules({
        ...base,
        nextOverrides: { batch: true, clips: true, motion: true },
      }),
    ).toEqual(['motion', 'clips']);
  });

  it('ignores stored values, preview organizations and self-hosted', () => {
    expect(
      findNewlyEnabledUnreleasedModules({
        ...base,
        nextOverrides: { motion: true },
        previousOverrides: { motion: true },
      }),
    ).toEqual([]);
    expect(
      findNewlyEnabledUnreleasedModules({
        ...base,
        isReleasePreviewEnabled: true,
        nextOverrides: { motion: true },
      }),
    ).toEqual([]);
    expect(
      findNewlyEnabledUnreleasedModules({
        ...base,
        hasOrganizationBilling: false,
        nextOverrides: { motion: true },
      }),
    ).toEqual([]);
  });

  it('treats unreadable stored overrides as nothing switched on', () => {
    expect(
      findNewlyEnabledUnreleasedModules({
        ...base,
        nextOverrides: { editor: true },
        previousOverrides: { editor: 'yes' },
      }),
    ).toEqual(['editor']);
    expect(
      findNewlyEnabledUnreleasedModules({ ...base, nextOverrides: undefined }),
    ).toEqual([]);
  });
});

describe('release preview navigation (#5502)', () => {
  it('shows founder-only navigation on self-hosted and preview organizations only', () => {
    expect(isReleasePreviewActive({ hasOrganizationBilling: false })).toBe(
      true,
    );
    expect(
      isReleasePreviewActive({
        hasOrganizationBilling: true,
        isReleasePreviewEnabled: true,
      }),
    ).toBe(true);
    expect(
      isReleasePreviewActive({
        hasOrganizationBilling: true,
        isReleasePreviewEnabled: false,
      }),
    ).toBe(false);
  });

  it('hides founder-only navigation while settings are unknown', () => {
    expect(isReleasePreviewActive(null)).toBe(false);
    expect(isReleasePreviewActive({})).toBe(false);
  });
});

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
        isReleasePreviewEnabled: true,
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

describe('existing work cancellation', () => {
  it('allows stopping existing work while new Motion work remains disabled', () => {
    expect(
      resolveOrganizationModuleAccess({
        ...cloud,
        moduleId: 'motion',
        operation: 'cancel',
      }),
    ).toEqual({ isAllowed: true, reason: null });
    expect(
      resolveOrganizationModuleAccess({
        ...cloud,
        moduleId: 'motion',
        operation: 'write',
      }),
    ).toEqual({ isAllowed: false, reason: 'disabled' });
  });
  it('does not require unavailable billing/settings to stop an already authorized job', () => {
    expect(
      resolveOrganizationModuleAccess({
        ...cloud,
        moduleId: 'automation',
        operation: 'cancel',
        hasPaidSubscription: null,
        isSettingsLoaded: false,
      }),
    ).toEqual({ isAllowed: true, reason: null });
  });
});

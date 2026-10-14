import { describe, expect, it } from 'vitest';
import {
  isOrganizationModuleOffered,
  ORGANIZATION_MODULE_IDS,
  type OrganizationModuleAccessInput,
  organizationModuleOverridesSchema,
  resolveOrganizationModuleAccess,
  resolveOrganizationModulePreferences,
  resolveOrganizationModulePresentationAccess,
} from './organization-modules.constant';

const cloud: OrganizationModuleAccessInput = {
  moduleId: 'playground',
  isSettingsLoaded: true,
  hasOrganizationBilling: true,
  hasPaidSubscription: false,
  isReleased: true,
  operation: 'write',
};

/** Releases the migration stores: the modules released before this change. */
const RELEASED = {
  release_analytics: true,
  release_discovery: true,
  release_publishing: true,
  release_turbo: true,
};

const UNRELEASED_MODULE_IDS = [
  'motion',
  'clips',
  'editor',
  'automation',
  'messages',
] as const;

describe('release gate', () => {
  it.each(UNRELEASED_MODULE_IDS)(
    'refuses new %s work while unreleased, even when paid',
    (moduleId) => {
      expect(
        resolveOrganizationModuleAccess({
          ...cloud,
          moduleId,
          hasPaidSubscription: true,
          isReleased: false,
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
          isReleased: false,
          operation,
        }),
      ).toEqual({ isAllowed: true, reason: null });
    }
  });

  it('hides unreleased modules from cloud navigation without preview', () => {
    const settings = {
      hasOrganizationBilling: true,
      moduleOverrides: { clips: true, automation: true, turbo: true },
    };
    const preferences = resolveOrganizationModulePreferences(
      settings,
      RELEASED,
    );
    expect(preferences?.clips).toBe(false);
    expect(preferences?.automation).toBe(false);
    expect(preferences?.turbo).toBe(true);
    expect(
      resolveOrganizationModulePreferences(
        { ...settings, isReleasePreviewEnabled: true },
        RELEASED,
      )?.clips,
    ).toBe(true);
    expect(
      resolveOrganizationModulePreferences(settings, {
        ...RELEASED,
        release_clips: true,
      })?.clips,
    ).toBe(true);
    expect(
      resolveOrganizationModulePresentationAccess(settings, 'clips', RELEASED),
    ).toEqual({ isAllowed: false, reason: 'unreleased' });
  });

  it('never gates Playground and Storyboard behind a release', () => {
    const preferences = resolveOrganizationModulePreferences(
      { hasOrganizationBilling: true, moduleOverrides: {} },
      {},
    );
    expect(preferences?.playground).toBe(true);
    expect(preferences?.storyboard).toBe(true);
    expect(preferences?.publishing).toBe(false);
  });
});

describe('offered modules', () => {
  const settings = { hasOrganizationBilling: true, moduleOverrides: {} };

  it('offers only released modules whose platform switch is on', () => {
    expect(
      ORGANIZATION_MODULE_IDS.filter((moduleId) =>
        isOrganizationModuleOffered(moduleId, settings, RELEASED),
      ),
    ).toEqual([
      'playground',
      'storyboard',
      'publishing',
      'analytics',
      'turbo',
      'discovery',
    ]);
  });

  it('drops a module switched off for the platform', () => {
    expect(
      isOrganizationModuleOffered('turbo', settings, {
        ...RELEASED,
        studio_turbo: false,
      }),
    ).toBe(false);
    expect(
      isOrganizationModuleOffered('playground', settings, {
        ...RELEASED,
        studio: false,
      }),
    ).toBe(false);
  });

  it('offers everything on self-hosted and on release preview', () => {
    for (const audience of [
      { hasOrganizationBilling: false },
      { hasOrganizationBilling: true, isReleasePreviewEnabled: true },
    ]) {
      expect(
        ORGANIZATION_MODULE_IDS.every((moduleId) =>
          isOrganizationModuleOffered(moduleId, audience, {}),
        ),
      ).toBe(true);
    }
  });

  it('offers nothing while settings are unknown', () => {
    expect(isOrganizationModuleOffered('playground', null, RELEASED)).toBe(
      false,
    );
  });
});

describe('organization module preference display', () => {
  it('resolves the settled server defaults independently of subscription eligibility', () => {
    expect(
      resolveOrganizationModulePreferences(
        { hasOrganizationBilling: true, moduleOverrides: {} },
        RELEASED,
      ),
    ).toEqual({
      playground: true,
      storyboard: true,
      publishing: true,
      analytics: true,
      motion: false,
      clips: false,
      turbo: false,
      editor: false,
      automation: false,
      messages: false,
      discovery: true,
    });
  });
  it('honors explicit hides, including Playground and Storyboard', () => {
    const preferences = resolveOrganizationModulePreferences(
      {
        hasOrganizationBilling: false,
        moduleOverrides: {
          clips: false,
          automation: true,
          playground: false,
          storyboard: false,
        },
      },
      {},
    );
    expect(preferences?.clips).toBe(false);
    expect(preferences?.motion).toBe(true);
    expect(preferences?.automation).toBe(true);
    expect(preferences?.playground).toBe(false);
    expect(preferences?.storyboard).toBe(false);
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
      expect(
        resolveOrganizationModulePreferences(settings, RELEASED),
      ).toBeNull();
    },
  );
});

describe('organization module admission', () => {
  it.each([
    'playground',
    'storyboard',
    'publishing',
    'analytics',
    'turbo',
  ] as const)('admits released %s without a subscription', (moduleId) => {
    expect(
      resolveOrganizationModuleAccess({ ...cloud, moduleId }).isAllowed,
    ).toBe(true);
  });
  it('requires a paid subscription for Discovery', () => {
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
    'treats unknown %s entitlement as unavailable',
    (moduleId) => {
      expect(
        resolveOrganizationModuleAccess({
          ...cloud,
          moduleId,
          hasPaidSubscription: null,
        }).reason,
      ).toBe('unavailable');
    },
  );
  it.each(ORGANIZATION_MODULE_IDS)(
    'preserves existing %s reads and exports when entitlement is unknown',
    (moduleId) => {
      for (const operation of ['read', 'export'] as const) {
        expect(
          resolveOrganizationModuleAccess({
            ...cloud,
            moduleId,
            isSettingsLoaded: false,
            hasPaidSubscription: null,
            isReleased: false,
            operation,
          }).isAllowed,
        ).toBe(true);
      }
    },
  );
  it('blocks new work when settings are unresolved', () => {
    expect(
      resolveOrganizationModuleAccess({ ...cloud, isSettingsLoaded: false })
        .reason,
    ).toBe('unavailable');
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
  it('rejects unknown module IDs, nulls and coercion on writes', () => {
    for (const candidate of [
      null,
      [],
      { typo: true },
      { turbo: 1 },
      { clips: null },
    ]) {
      expect(
        organizationModuleOverridesSchema.safeParse(candidate).success,
      ).toBe(false);
    }
    expect(
      organizationModuleOverridesSchema.parse({
        automation: true,
        playground: false,
        turbo: false,
      }),
    ).toEqual({ automation: true, playground: false, turbo: false });
  });
});

describe('module presentation', () => {
  it.each(['automation', 'messages', 'discovery'] as const)(
    'requires a verified paid grant for %s even when shown',
    (moduleId) => {
      const settings = {
        hasOrganizationBilling: true,
        isReleasePreviewEnabled: true,
        moduleOverrides: { [moduleId]: true },
      };
      expect(
        resolveOrganizationModulePresentationAccess(settings, moduleId, {}),
      ).toEqual({ isAllowed: false, reason: 'unavailable' });
      expect(
        resolveOrganizationModulePresentationAccess(
          { ...settings, hasPaidModuleSubscription: false },
          moduleId,
          {},
        ),
      ).toEqual({ isAllowed: false, reason: 'subscription-required' });
      expect(
        resolveOrganizationModulePresentationAccess(
          { ...settings, hasPaidModuleSubscription: true },
          moduleId,
          {},
        ),
      ).toEqual({ isAllowed: true, reason: null });
    },
  );
  it('does not accept malformed paid eligibility or overrides', () => {
    expect(
      resolveOrganizationModulePresentationAccess(
        {
          hasOrganizationBilling: true,
          moduleOverrides: {},
          hasPaidModuleSubscription: 'true',
        },
        'discovery',
        RELEASED,
      ),
    ).toEqual({ isAllowed: false, reason: 'unavailable' });
    for (const moduleOverrides of [null, [], 'on', { turbo: 'true' }]) {
      expect(
        resolveOrganizationModulePresentationAccess(
          { hasOrganizationBilling: true, moduleOverrides },
          'turbo',
          RELEASED,
        ),
      ).toEqual({ isAllowed: false, reason: 'unavailable' });
    }
  });
  it('reports a module the organization hides as disabled, whatever its grant', () => {
    expect(
      resolveOrganizationModulePresentationAccess(
        {
          hasOrganizationBilling: true,
          moduleOverrides: { discovery: false },
          hasPaidModuleSubscription: true,
        },
        'discovery',
        RELEASED,
      ),
    ).toEqual({ isAllowed: false, reason: 'disabled' });
    expect(
      resolveOrganizationModulePresentationAccess(
        {
          hasOrganizationBilling: true,
          moduleOverrides: { playground: false },
        },
        'playground',
        {},
      ),
    ).toEqual({ isAllowed: false, reason: 'disabled' });
  });
  it('preserves self-hosted and credit-based work without a paid grant', () => {
    expect(
      resolveOrganizationModulePresentationAccess(
        { hasOrganizationBilling: false, moduleOverrides: {} },
        'automation',
        {},
      ),
    ).toEqual({ isAllowed: true, reason: null });
    expect(
      resolveOrganizationModulePresentationAccess(
        { hasOrganizationBilling: true, moduleOverrides: {} },
        'playground',
        {},
      ),
    ).toEqual({ isAllowed: true, reason: null });
  });
});

describe('existing work cancellation', () => {
  it('allows stopping existing work while new Motion work is unreleased', () => {
    expect(
      resolveOrganizationModuleAccess({
        ...cloud,
        moduleId: 'motion',
        isReleased: false,
        operation: 'cancel',
      }),
    ).toEqual({ isAllowed: true, reason: null });
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

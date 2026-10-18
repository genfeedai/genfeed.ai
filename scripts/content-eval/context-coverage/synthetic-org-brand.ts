/**
 * Two fictional tenants (public repo: no customer data). KELDER is the tenant
 * under test; MARLOW is the decoy whose strings must never reach KELDER's
 * prompt, and the other way round.
 */

import type {
  ContentHarnessInput,
  ContentHarnessPack,
} from '@genfeedai/harness';

export interface SyntheticTenant {
  antiExample: string;
  bannedPhrase: string;
  brandId: string;
  brandName: string;
  brandVoiceSentinel: string;
  criteriaSentinel: string;
  example: string;
  orgDirective: string;
  organizationId: string;
  tone: string;
}

export const KELDER: SyntheticTenant = {
  antiExample: 'KELDER-ANTI: The best skillet ever, buy now!!!',
  bannedPhrase: 'game-changer',
  brandId: 'brand-kelder',
  brandName: 'KELDER',
  brandVoiceSentinel: 'KELDER-VOICE: calm Scandinavian precision',
  criteriaSentinel: 'KELDER-CRITERIA: names one concrete cooking use',
  example: 'KELDER-EXAMPLE: Preheat the pan ten minutes; the edges caramelise.',
  orgDirective: 'KELDER-ORG: Kelder Group never mentions competitors',
  organizationId: 'org-kelder',
  tone: 'calm, precise',
};

export const MARLOW: SyntheticTenant = {
  antiExample: 'MARLOW-ANTI: Epic deals on every trail pack!!!',
  bannedPhrase: 'bombproof',
  brandId: 'brand-marlow',
  brandName: 'MARLOW',
  brandVoiceSentinel: 'MARLOW-VOICE: loud trail-side swagger',
  criteriaSentinel: 'MARLOW-CRITERIA: grounds the post in one trail situation',
  example: 'MARLOW-EXAMPLE: Wet woodland loop, map dry in the side pocket.',
  orgDirective: 'MARLOW-ORG: Marlow Outdoor always names the trail',
  organizationId: 'org-marlow',
  tone: 'energetic, loud',
};

/** Same shape as a private harness pack: matches on brand id, never on text. */
export function buildTenantPack(tenant: SyntheticTenant): ContentHarnessPack {
  return {
    contribute(input: ContentHarnessInput) {
      return {
        ...(input.organizationId === tenant.organizationId
          ? { systemDirectives: [tenant.orgDirective] }
          : {}),
        ...(input.brandId === tenant.brandId
          ? {
              evaluationCriteria: [tenant.criteriaSentinel],
              guardrails: [`Never use the phrase "${tenant.bannedPhrase}".`],
              sources: [
                {
                  content: tenant.example,
                  id: `${tenant.brandId}-example`,
                  kind: 'brand_example' as const,
                },
                {
                  content: tenant.antiExample,
                  id: `${tenant.brandId}-anti-example`,
                  kind: 'anti_example' as const,
                },
              ],
              styleDirectives: [tenant.brandVoiceSentinel],
            }
          : {}),
      };
    },
    id: `synthetic-${tenant.brandId}`,
    version: '1.0.0',
  };
}

/** Copywriting rules that must not leak into an image or video prompt. */
export const COPY_ONLY_PACK: ContentHarnessPack = {
  contribute() {
    return {
      guardrails: ['COPY-ONLY: open with a one-line hook'],
    };
  },
  id: 'synthetic-copy-only',
  surfaces: ['copy'],
  version: '1.0.0',
};

/**
 * Proves, for every harness content kind, that the org + brand context the
 * product composes is what ends up in the prompt text, and that another
 * tenant's context never does. Runs the real `buildHarnessInput`, the real
 * built-in packs, `composeContentHarnessBrief` and `formatHarnessBrief`; only
 * the tenant packs are synthetic. No model call, so it costs nothing and can
 * gate a PR.
 */

import {
  buildHarnessInput,
  formatHarnessBrief,
} from '@api/services/harness/harness-brief.util';
import {
  BRAND_FIDELITY_HARNESS_PACK,
  CORE_CONTENT_HARNESS_PACK,
  type ContentHarnessBrief,
  type ContentHarnessInput,
  ContentHarnessRegistry,
  type ContentKind,
  composeContentHarnessBrief,
  VIRAL_PSYCHOLOGY_HARNESS_PACK,
  X_PLATFORM_HARNESS_PACK,
} from '@genfeedai/harness';
import { describe, expect, it } from 'vitest';
import {
  buildTenantPack,
  COPY_ONLY_PACK,
  KELDER,
  MARLOW,
  type SyntheticTenant,
} from './synthetic-org-brand';

const CONTENT_KINDS: readonly ContentKind[] = [
  'ad-creative',
  'article',
  'email',
  'image',
  'newsletter',
  'post',
  'reply',
  'script',
  'thread',
  'ugc',
  'video',
  'video-script',
];
const MEDIA_KINDS: ReadonlySet<ContentKind> = new Set([
  'ad-creative',
  'image',
  'ugc',
  'video',
]);

function buildRegistry(): ContentHarnessRegistry {
  const registry = new ContentHarnessRegistry();
  for (const pack of [
    BRAND_FIDELITY_HARNESS_PACK,
    CORE_CONTENT_HARNESS_PACK,
    VIRAL_PSYCHOLOGY_HARNESS_PACK,
    X_PLATFORM_HARNESS_PACK,
    COPY_ONLY_PACK,
    buildTenantPack(KELDER),
    buildTenantPack(MARLOW),
  ]) {
    registry.registerPack(pack);
  }
  return registry;
}

function inputFor(
  tenant: SyntheticTenant,
  contentType: ContentKind,
): ContentHarnessInput {
  return buildHarnessInput({
    brand: {
      agentConfig: {
        voice: {
          doNotSoundLike: [`${tenant.brandName} rival voice`],
          tone: tenant.tone,
        },
      },
      description: `${tenant.brandName} description`,
      id: tenant.brandId,
      label: tenant.brandName,
      primaryColor: '#101010',
      secondaryColor: '#f0f0f0',
      text: `${tenant.brandName} text`,
    } as Parameters<typeof buildHarnessInput>[0]['brand'],
    intent: { contentType, objective: 'engagement', platform: 'twitter' },
    organizationId: tenant.organizationId,
  });
}

async function promptFor(
  tenant: SyntheticTenant,
  contentType: ContentKind,
  surface?: 'copy' | 'media',
): Promise<{ brief: ContentHarnessBrief; prompt: string }> {
  const brief = await composeContentHarnessBrief(
    buildRegistry(),
    inputFor(tenant, contentType),
    surface ? { surface } : undefined,
  );
  return { brief, prompt: formatHarnessBrief(brief) };
}

function sentinels(tenant: SyntheticTenant): string[] {
  return [
    tenant.orgDirective,
    tenant.brandVoiceSentinel,
    tenant.criteriaSentinel,
    tenant.example,
    tenant.antiExample,
    tenant.brandName,
  ];
}

describe.each(CONTENT_KINDS)('org + brand context for %s', (contentType) => {
  const surface = MEDIA_KINDS.has(contentType) ? 'media' : 'copy';

  it('puts the org directive, brand voice, guardrails and criteria in the prompt', async () => {
    const { prompt } = await promptFor(KELDER, contentType, surface);

    expect(prompt).toContain(KELDER.orgDirective);
    expect(prompt).toContain(KELDER.brandVoiceSentinel);
    expect(prompt).toContain(`Never use the phrase "${KELDER.bannedPhrase}".`);
    expect(prompt).toContain(KELDER.criteriaSentinel);
    expect(prompt).toContain(`Tone: ${KELDER.tone}.`);
    expect(prompt).toContain(
      `Do not sound like: ${KELDER.brandName} rival voice.`,
    );
    expect(prompt).toContain(`Write as ${KELDER.brandName}.`);
  });

  it('carries the brand examples and anti-examples as sources', async () => {
    const { brief, prompt } = await promptFor(KELDER, contentType, surface);

    expect(brief.sources.map((source) => source.kind).sort()).toEqual([
      'anti_example',
      'brand_example',
    ]);
    expect(prompt).toContain(KELDER.example);
    expect(prompt).toContain(KELDER.antiExample);
  });

  it('never lets the other tenant into the prompt, in either direction', async () => {
    const kelder = await promptFor(KELDER, contentType, surface);
    const marlow = await promptFor(MARLOW, contentType, surface);

    for (const sentinel of sentinels(MARLOW)) {
      expect(kelder.prompt).not.toContain(sentinel);
    }
    for (const sentinel of sentinels(KELDER)) {
      expect(marlow.prompt).not.toContain(sentinel);
    }
  });

  it('adds no tenant context when the brand is unknown', async () => {
    const brief = await composeContentHarnessBrief(
      buildRegistry(),
      buildHarnessInput({
        brand: null,
        intent: { contentType, objective: 'engagement' },
        organizationId: 'org-unknown',
      }),
    );
    const prompt = formatHarnessBrief(brief);

    for (const sentinel of [...sentinels(KELDER), ...sentinels(MARLOW)]) {
      expect(prompt).not.toContain(sentinel);
    }
  });
});

describe('surface filtering', () => {
  it('keeps copywriting packs out of media prompts but not out of copy', async () => {
    const media = await promptFor(KELDER, 'image', 'media');
    const copy = await promptFor(KELDER, 'post', 'copy');

    expect(media.prompt).not.toContain('COPY-ONLY');
    expect(copy.prompt).toContain('COPY-ONLY');
    expect(media.prompt).toContain(KELDER.brandVoiceSentinel);
  });

  it('composes the same brand context with or without a surface filter', async () => {
    const unfiltered = await promptFor(KELDER, 'post');

    expect(unfiltered.prompt).toContain(KELDER.brandVoiceSentinel);
    expect(unfiltered.prompt).toContain(KELDER.orgDirective);
  });
});

describe('Brand OS identity', () => {
  it('feeds the approved revision ahead of pack contributions', async () => {
    const input = inputFor(KELDER, 'post');
    const brief = await composeContentHarnessBrief(buildRegistry(), {
      ...input,
      identityContribution: {
        systemDirectives: [
          'Use this approved Brand OS as the authoritative brand identity.',
        ],
      },
    });

    expect(brief.systemDirectives[0]).toBe(
      'Use this approved Brand OS as the authoritative brand identity.',
    );
  });
});

import { CONTENT_LEARNING_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/content-learning-workflows.template';
import {
  findPlatformSeedTemplate,
  getPlatformSeedContentHash,
  isCanonicalPlatformSeed,
  isPlatformScheduledTemplate,
  PLATFORM_SEED_TEMPLATE_SETS,
} from '@api/collections/workflows/utils/workflow-platform-seed.util';
import { describe, expect, it } from 'vitest';

const allTemplates = Object.values(PLATFORM_SEED_TEMPLATE_SETS).flatMap(
  (set) => [...set.templates],
);
const scheduledTemplates = allTemplates.filter(isPlatformScheduledTemplate);

describe('platform seed catalog', () => {
  it('has unique template ids across every seeded set', () => {
    const ids = allTemplates.map((template) => template.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('resolves every scheduled template and nothing else', () => {
    expect(scheduledTemplates.length).toBeGreaterThan(0);
    for (const template of scheduledTemplates) {
      expect(findPlatformSeedTemplate(template.id)).toBe(template);
    }
    const manual = CONTENT_LEARNING_WORKFLOW_TEMPLATES.find(
      (template) => !isPlatformScheduledTemplate(template),
    );
    expect(manual).toBeDefined();
    expect(findPlatformSeedTemplate(manual?.id ?? '')).toBeUndefined();
    expect(findPlatformSeedTemplate('forged-key')).toBeUndefined();
  });

  it('builds a stable content hash for every scheduled template', () => {
    for (const template of scheduledTemplates) {
      const hash = getPlatformSeedContentHash(template);
      expect(hash).toMatch(/^sha256:v1:[0-9a-f]{64}$/);
      expect(getPlatformSeedContentHash(template)).toBe(hash);
    }
  });
});

describe('isCanonicalPlatformSeed', () => {
  const template = scheduledTemplates[0];
  const canonicalHash = getPlatformSeedContentHash(template);
  const canonical = {
    brandId: null,
    currentVersion: { contentHash: canonicalHash },
    platformSeedKey: template.id,
  };

  it('accepts a marked row whose current version is the template', () => {
    expect(isCanonicalPlatformSeed(canonical)).toBe(true);
  });

  it.each([
    ['an unmarked row', { platformSeedKey: null }],
    ['an empty marker', { platformSeedKey: '' }],
    ['an unknown template', { platformSeedKey: 'forged-key' }],
    [
      'an unscheduled template',
      {
        platformSeedKey: CONTENT_LEARNING_WORKFLOW_TEMPLATES.find(
          (candidate) => !isPlatformScheduledTemplate(candidate),
        )?.id,
      },
    ],
    ['an edited graph', { currentVersion: { contentHash: 'sha256:v1:other' } }],
    ['no version hash', { currentVersion: { contentHash: null } }],
    ['no version', { currentVersion: null }],
    ['a brand-scoped row', { brandId: 'brand-1' }],
    [
      'another template graph under this marker',
      {
        currentVersion: {
          contentHash: getPlatformSeedContentHash(scheduledTemplates[1]),
        },
      },
    ],
  ])('rejects %s', (_name, overrides) => {
    expect(isCanonicalPlatformSeed({ ...canonical, ...overrides })).toBe(false);
  });
});

import {
  remixPublicUrl,
  remixToJson,
  requireBrandRemixBrandId,
} from '@api/collections/content-runs/services/brand-remix-run-helpers';
import {
  projectBrandRemixRun,
  summarizeBrandRemixRun,
} from '@api/collections/content-runs/services/brand-remix-run-projection';
import type {
  BrandRemixRunRecord,
  ResolvedBrandContext,
} from '@api/collections/content-runs/services/brand-remix-runs.types';
import { ContentRunStatus } from '@genfeedai/contracts';
import { brandRemixRunConfigSchema } from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import { ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

const config = brandRemixRunConfigSchema.parse({
  contract: 'brand-remix-run',
  draft: {
    fidelityMode: 'guided',
    identity: {},
    intent: { objective: 'Create an original brand execution.' },
    output: { aspectRatio: '1:1', count: 1, kind: 'image' },
    references: [],
    reviewRequired: true,
    target: { kind: 'organic', platform: 'instagram' },
  },
  phase: 'prefilled',
  readiness: { issues: [], state: 'ready' },
  recipeVersion: 1,
  revision: 1,
  sourceSnapshot: {
    capturedAt: '2026-08-20T10:00:00.000Z',
    evidence: ['hook'],
    metrics: {},
    pattern: { hook: 'Outcome-led relevance hook.' },
    platform: 'instagram',
    selector: { kind: 'source_post', sourcePostId: 'source-post-1' },
    sourceId: 'source-post-1',
    title: 'hook',
  },
  version: 1,
});

describe('brand remix projection', () => {
  it('projects a tenant-owned run without echoing source payload fields', () => {
    const run = {
      brandId: 'brand-1',
      config,
      createdAt: new Date('2026-08-20T10:00:00.000Z'),
      id: 'run-1',
      isDeleted: false,
      organizationId: 'org-1',
      status: ContentRunStatus.PENDING,
      updatedAt: new Date('2026-08-20T10:01:00.000Z'),
    } as BrandRemixRunRecord;
    const brandContext = {
      brand: { id: 'brand-1', label: 'Acme' },
      brandKit: { references: [] },
      contextMode: 'brand',
      defaultIdentity: {},
    } as unknown as ResolvedBrandContext;

    const view = projectBrandRemixRun(run, brandContext, config);

    expect(view.id).toBe('run-1');
    expect(view.brandId).toBe('brand-1');
    expect(view.brand).toEqual({
      contextMode: 'brand',
      id: 'brand-1',
      name: 'Acme',
    });
    expect(view.source).toBeUndefined();
  });

  it('strips tokens from public source URLs before they can be persisted', () => {
    expect(
      remixPublicUrl(
        'https://tiktok.example/@creator/video/1?token=must-not-persist#preview',
      ),
    ).toBe('https://tiktok.example/@creator/video/1');
    expect(remixToJson({ capturedAt: '2026-08-20T10:00:00.000Z' })).toEqual({
      capturedAt: '2026-08-20T10:00:00.000Z',
    });
  });

  it('fails closed when a run has no owning brand', () => {
    expect(() =>
      requireBrandRemixBrandId({
        brandId: null,
        config,
        createdAt: new Date('2026-08-20T10:00:00.000Z'),
        id: 'run-1',
        isDeleted: false,
        organizationId: 'org-1',
        status: ContentRunStatus.PENDING,
        updatedAt: new Date('2026-08-20T10:00:00.000Z'),
      } as BrandRemixRunRecord),
    ).toThrow(ConflictException);
  });

  it('summarizes a run for the storyboard runs list', () => {
    const sceneConfig = brandRemixRunConfigSchema.parse({
      ...config,
      concept: {
        savedAt: '2026-08-20T10:00:00.000Z',
        storyboard: [
          { durationSeconds: 5, ordinal: 1, visualIntent: 'Open on proof.' },
          { durationSeconds: 7.5, ordinal: 2, visualIntent: 'Show product.' },
          { ordinal: 3, visualIntent: 'Close on offer.' },
        ],
      },
      draft: {
        ...config.draft,
        output: {
          aspectRatio: '9:16',
          count: 1,
          durationSeconds: 30,
          kind: 'video',
        },
      },
      phase: 'partially_ready',
    });
    const run = {
      brandId: 'brand-1',
      config: sceneConfig,
      createdAt: new Date('2026-08-20T10:00:00.000Z'),
      id: 'run-2',
      isDeleted: false,
      organizationId: 'org-1',
      status: ContentRunStatus.PENDING,
      updatedAt: new Date('2026-08-21T09:00:00.000Z'),
    } as BrandRemixRunRecord;

    expect(summarizeBrandRemixRun(run, sceneConfig)).toEqual({
      brandId: 'brand-1',
      createdAt: '2026-08-20T10:00:00.000Z',
      id: 'run-2',
      outputKind: 'video',
      phase: 'partially_ready',
      runtimeSeconds: 12.5,
      shotCount: 3,
      sourceKind: 'remix_discovery',
      title: 'hook',
      updatedAt: '2026-08-21T09:00:00.000Z',
    });
  });

  it('falls back to the requested output duration when a run has no shots', () => {
    const run = {
      brandId: 'brand-1',
      config,
      createdAt: new Date('2026-08-20T10:00:00.000Z'),
      id: 'run-1',
      isDeleted: false,
      organizationId: 'org-1',
      status: ContentRunStatus.PENDING,
      updatedAt: new Date('2026-08-20T10:01:00.000Z'),
    } as BrandRemixRunRecord;
    const videoConfig = brandRemixRunConfigSchema.parse({
      ...config,
      draft: {
        ...config.draft,
        output: {
          aspectRatio: '9:16',
          count: 2,
          durationSeconds: 15,
          kind: 'video',
        },
      },
    });

    expect(summarizeBrandRemixRun(run, config)).toMatchObject({
      outputKind: 'image',
      runtimeSeconds: null,
      shotCount: 0,
    });
    expect(summarizeBrandRemixRun(run, videoConfig)).toMatchObject({
      runtimeSeconds: 15,
      shotCount: 0,
    });
  });
});

import { BrandRemixRunPersistenceService } from '@api/collections/content-runs/services/brand-remix-run-persistence.service';
import { BrandRemixRunProviderDispatchService } from '@api/collections/content-runs/services/brand-remix-run-provider-dispatch.service';
import { BrandRemixRunStateService } from '@api/collections/content-runs/services/brand-remix-run-state.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  type BrandRemixRunConfig,
  brandRemixRunConfigSchema,
} from '@api-types/contracts/brand-remix-run.contract';
import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeConfig() {
  return brandRemixRunConfigSchema.parse({
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
    execution: {
      actualCount: 0,
      generationBrief: {
        constraints: [
          {
            kind: 'avoid',
            required: true,
            value:
              'Do not copy, closely paraphrase, quote, or identify the source creative.',
          },
        ],
        fidelityMode: 'guided',
        intent: {
          objective: 'Create an original Instagram execution for Acme.',
          requestedText: [],
          subjects: ['Acme'],
          visualDirection: 'Use an original brand-owned composition.',
        },
        mediaKind: 'image',
        output: { aspectRatio: '1:1' },
        provenance: [],
        references: [],
        version: 1,
      },
      requestedCount: 1,
      variants: [
        { assetIds: [], id: 'variant-1', recipeRevision: 1, status: 'queued' },
      ],
    },
    phase: 'generating',
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
}

describe('BrandRemixRunProviderDispatchService', () => {
  const imageGenerationService = { generateImage: vi.fn() };
  const videoGenerationService = { generateVideo: vi.fn() };
  const avatarVideoGenerationService = { generateAvatarVideo: vi.fn() };
  const contentGeneratorService = { generateContent: vi.fn() };
  const creditsUtilsService = {
    checkOrganizationCreditsAvailable: vi.fn(),
    getOrganizationCreditsBalance: vi.fn(),
  };
  let dispatch: BrandRemixRunProviderDispatchService;

  beforeEach(() => {
    vi.resetAllMocks();
    const prisma = {
      contentRun: { findFirst: vi.fn(), updateMany: vi.fn() },
    } as unknown as PrismaService;
    const persistence = new BrandRemixRunPersistenceService(prisma);
    const state = new BrandRemixRunStateService(prisma, persistence);
    dispatch = new BrandRemixRunProviderDispatchService(
      imageGenerationService as never,
      videoGenerationService as never,
      avatarVideoGenerationService as never,
      contentGeneratorService as never,
      creditsUtilsService as never,
      persistence,
      state,
    );
  });

  it('compiles a canonical brief into semantic provider input without source copy', () => {
    const prompt = dispatch.compileProviderPrompt(makeConfig());

    expect(prompt).toContain(
      'Create an original Instagram execution for Acme.',
    );
    expect(prompt).toContain('Do not copy');
    expect(prompt).not.toContain('source-post-1');
  });

  it('rejects copy variants on the media dispatch path', async () => {
    const config = brandRemixRunConfigSchema.parse({
      ...makeConfig(),
      draft: {
        ...makeConfig().draft,
        output: { count: 1, kind: 'copy' },
      },
    });

    await expect(
      dispatch.dispatchVariant({
        brandId: 'brand-1',
        config,
        onCreditsPrepared: async () => undefined,
        onPlaceholderCreated: async () => undefined,
        placeholderScope: { groupId: 'run-1', groupIndex: 0 },
        request: {} as never,
        user: { organizationId: 'org-1', userId: 'user-1' } as never,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(imageGenerationService.generateImage).not.toHaveBeenCalled();
  });

  it('dispatches one image provider call with the compiled prompt', async () => {
    imageGenerationService.generateImage.mockResolvedValue({
      data: { id: 'image-1', type: 'ingredient' },
    });

    const assetId = await dispatch.dispatchVariant({
      brandId: 'brand-1',
      config: makeConfig(),
      onCreditsPrepared: async () => undefined,
      onPlaceholderCreated: async () => undefined,
      placeholderScope: { groupId: 'run-1', groupIndex: 0 },
      request: {} as never,
      user: { organizationId: 'org-1', userId: 'user-1' } as never,
    });

    expect(assetId).toBe('image-1');
    expect(imageGenerationService.generateImage).toHaveBeenCalledTimes(1);
    expect(imageGenerationService.generateImage.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        brandId: 'brand-1',
        outputs: 1,
        text: expect.stringContaining('Create an original Instagram execution'),
      }),
    );
    expect(imageGenerationService.generateImage.mock.calls[0]?.[6]).toEqual(
      makeConfig().execution?.generationBrief.references,
    );
  });

  it('keeps video references out of image generation input', async () => {
    imageGenerationService.generateImage.mockResolvedValue({
      data: { id: 'image-1', type: 'ingredient' },
    });
    const base = makeConfig();
    const config = {
      ...base,
      execution: {
        ...base.execution,
        generationBrief: {
          ...base.execution?.generationBrief,
          references: [
            { assetId: 'product-still', role: 'product' },
            { assetId: 'motion-reference', role: 'reference_video' },
          ],
        },
      },
    } as BrandRemixRunConfig;

    await dispatch.dispatchVariant({
      brandId: 'brand-1',
      config,
      onCreditsPrepared: async () => undefined,
      onPlaceholderCreated: async () => undefined,
      placeholderScope: { groupId: 'run-1', groupIndex: 0 },
      request: {} as never,
      user: { organizationId: 'org-1', userId: 'user-1' } as never,
    });

    expect(imageGenerationService.generateImage.mock.calls[0]?.[6]).toEqual([
      { assetId: 'product-still', role: 'product' },
    ]);
  });

  it('threads the immutable run references into every video dispatch', async () => {
    videoGenerationService.generateVideo.mockResolvedValue({
      data: { id: 'video-1', type: 'ingredient' },
    });
    const base = makeConfig();
    const config = brandRemixRunConfigSchema.parse({
      ...base,
      draft: {
        ...base.draft,
        output: { aspectRatio: '9:16', count: 1, kind: 'video' },
        references: [
          {
            assetId: 'character-sheet',
            role: 'character',
            source: 'brand_default',
          },
          {
            assetId: 'product-still',
            description: 'Matte black bottle with gold cap',
            role: 'product',
            source: 'brand_default',
          },
        ],
      },
      execution: {
        ...base.execution,
        generationBrief: {
          ...base.execution?.generationBrief,
          mediaKind: 'video',
          output: { aspectRatio: '9:16', durationSeconds: 8 },
          references: [
            { assetId: 'character-sheet', role: 'character' },
            {
              assetId: 'product-still',
              description: 'Matte black bottle with gold cap',
              role: 'product',
            },
          ],
        },
      },
    });

    await dispatch.dispatchVariant({
      brandId: 'brand-1',
      config,
      onCreditsPrepared: async () => undefined,
      onPlaceholderCreated: async () => undefined,
      placeholderScope: { groupId: 'run-1', groupIndex: 0 },
      request: {} as never,
      user: { organizationId: 'org-1', userId: 'user-1' } as never,
    });

    expect(videoGenerationService.generateVideo.mock.calls[0]?.[6]).toEqual(
      config.execution?.generationBrief.references,
    );
  });

  it('refuses avatar dispatch without a configured identity', async () => {
    const config = brandRemixRunConfigSchema.parse({
      ...makeConfig(),
      draft: {
        ...makeConfig().draft,
        output: { aspectRatio: '9:16', count: 1, kind: 'avatar' },
      },
    });

    await expect(
      dispatch.dispatchVariant({
        brandId: 'brand-1',
        config,
        onCreditsPrepared: async () => undefined,
        onPlaceholderCreated: async () => undefined,
        placeholderScope: { groupId: 'run-1', groupIndex: 0 },
        request: {} as never,
        user: { organizationId: 'org-1', userId: 'user-1' } as never,
      }),
    ).rejects.toThrow('Avatar identity is not configured.');
    expect(
      avatarVideoGenerationService.generateAvatarVideo,
    ).not.toHaveBeenCalled();
  });
});

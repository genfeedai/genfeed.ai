import { BrandsService } from '@api/collections/brands/services/brands.service';
import { HarnessProfilesService } from '@api/collections/harness-profiles/services/harness-profiles.service';
import { MediaPromptBrandEnhancementException } from '@api/helpers/exceptions/media-prompt-brand-enhancement/media-prompt-brand-enhancement.exception';
import { GenerationHarnessSettingsService } from '@api/services/harness/generation-harness-settings.service';
import { ContentHarnessService } from '@api/services/harness/harness.service';
import { HarnessGenerationService } from '@api/services/harness/harness-generation.service';
import { MediaPromptEnhancementService } from '@api/services/harness/media-prompt-enhancement.service';
import {
  PromptEnhancementResponseError,
  PromptEnhancementService,
} from '@api/services/prompt-enhancement/prompt-enhancement.service';
import { brandAccessFixture } from '@api/shared/testing/brand-access.fixture';
import { MEDIA_PROMPT_BRAND_ENHANCEMENT_FAILED_ERROR_CODE } from '@genfeedai/contracts/constants';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

function setup(enabled = true) {
  const settings = {
    get: vi.fn().mockResolvedValue({ isEnabled: enabled, source: 'brand' }),
  };
  const harness = {
    resolveBrief: vi.fn().mockResolvedValue({
      appliedPacks: ['public-pack'],
      systemDirectives: [],
      styleDirectives: [],
      guardrails: [],
      sources: [],
      metadata: { contentType: 'image' },
    }),
    formatBrief: vi.fn().mockReturnValue('Private guidance'),
  };
  const packs = {
    listLoadedPackVersions: vi.fn().mockResolvedValue([
      { id: 'public-pack', version: '1.2.3' },
      { id: 'unused', version: '1' },
    ]),
  };
  const promptEnhancement = {
    resolveModel: vi.fn().mockResolvedValue('admin/default-text'),
    enhance: vi.fn().mockResolvedValue({
      result: 'A cinematic view of a red bicycle',
      tokensUsed: 10,
      isByok: false,
    }),
  };
  const logger = { error: vi.fn(), warn: vi.fn() };
  const modes = {
    resolve: vi.fn().mockResolvedValue({ mode: 'approved_brand' }),
  };
  const snapshots = {
    preview: vi.fn().mockResolvedValue({
      revisionId: 'revision-approved',
      revisionVersion: 3,
    }),
    previewProvisional: vi
      .fn()
      .mockResolvedValue({ revisionId: 'revision-draft', revisionVersion: 4 }),
  };
  return {
    logger,
    modes,
    snapshots,
    settings,
    harness,
    packs,
    promptEnhancement,
    service: new MediaPromptEnhancementService(
      settings as never,
      harness as never,
      packs as never,
      promptEnhancement as never,
      modes as never,
      snapshots as never,
      logger as never,
    ),
  };
}
const input = {
  actorUserId: 'user',
  organizationId: 'org',
  brandId: 'brand',
  prompt: '  A red bicycle.\n',
  contentType: 'image' as const,
  model: 'image-model',
};

describe('MediaPromptEnhancementService', () => {
  it('rejects selected skills when enhancement is disabled before any model work', async () => {
    const { service, promptEnhancement, harness } = setup(false);
    await expect(
      service.enhance({ ...input, requestedSkillSlugs: ['cinema'] }),
    ).rejects.toThrow('Enable enhancement');
    expect(promptEnhancement.enhance).not.toHaveBeenCalled();
    expect(harness.resolveBrief).not.toHaveBeenCalled();
  });
  describe('Knowledge', () => {
    const citation = {
      kind: 'TEXT',
      purpose: 'BRAND_TRUTH',
      sourceId: 'source-1',
      title: 'Brand facts',
      version: 2,
      versionId: 'version-2',
    };

    it('grounds an explicit pick even when brand enhancement is off, and records receipts', async () => {
      const { service, harness } = setup(false);
      harness.resolveBrief.mockResolvedValue({
        appliedPacks: [],
        systemDirectives: [],
        styleDirectives: [],
        guardrails: [],
        sources: [
          {
            content: 'Our mascot is a teal heron named Pim.',
            id: 'knowledge-1',
            kind: 'brand_voice',
            metadata: { citation, relevance: 0.55 },
          },
        ],
        metadata: { contentType: 'image' },
      });

      const receipt = await service.enhance({
        ...input,
        knowledgeSelection: { sourceIds: ['source-1'] },
      });

      expect(harness.resolveBrief).toHaveBeenCalledWith(
        expect.objectContaining({
          knowledgeSelection: { sourceIds: ['source-1'] },
        }),
      );
      expect(receipt.status).toBe('applied');
      expect(receipt.source).toBe('request');
      expect(receipt.enhancedPrompt).toContain(
        'Our mascot is a teal heron named Pim.',
      );
      expect(receipt.knowledgeReceipts).toEqual([
        expect.objectContaining({
          excerpt: 'Our mascot is a teal heron named Pim.',
          relevance: 0.55,
          sourceId: 'source-1',
          version: 2,
          versionId: 'version-2',
        }),
      ]);
    });

    it('treats an empty pick as automatic retrieval', async () => {
      const { service, harness } = setup();
      await service.enhance({ ...input, knowledgeSelection: {} });

      expect(harness.resolveBrief).toHaveBeenCalledWith(
        expect.not.objectContaining({ knowledgeSelection: expect.anything() }),
      );
    });

    it('rejects an explicit pick when the request turns enhancement off', async () => {
      const { service, harness } = setup();
      await expect(
        service.enhance({
          ...input,
          harness: false,
          knowledgeSelection: { sourceIds: ['source-1'] },
        }),
      ).rejects.toThrow('Enable enhancement');
      expect(harness.resolveBrief).not.toHaveBeenCalled();
    });
  });

  it('forwards normalized selections and preserves actionable selection errors', async () => {
    const { service, promptEnhancement } = setup();
    const error = new BadRequestException('Remove unavailable selection');
    promptEnhancement.enhance.mockRejectedValue(error);
    await expect(
      service.enhance({ ...input, requestedSkillSlugs: ['Cinema'] }),
    ).rejects.toBe(error);
    expect(promptEnhancement.enhance).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedSkillSlugs: ['cinema'],
        contentType: 'image',
      }),
    );
  });

  it('preserves exact caller bytes and makes no enhancement calls when disabled', async () => {
    const { service, harness, promptEnhancement, packs } = setup(false);
    expect(await service.enhance(input)).toEqual({
      originalPrompt: input.prompt,
      enhancedPrompt: input.prompt,
      brandId: 'brand',
      brandMode: 'raw',
      status: 'skipped',
      source: 'brand',
      appliedPacks: [],
    });
    expect(harness.resolveBrief).not.toHaveBeenCalled();
    expect(promptEnhancement.enhance).not.toHaveBeenCalled();
    expect(packs.listLoadedPackVersions).not.toHaveBeenCalled();
  });

  it('honors explicit request overrides and exposes only contributing IDs and versions', async () => {
    const { service, promptEnhancement } = setup(false);
    const receipt = await service.enhance({ ...input, harness: true });
    expect(receipt).toEqual({
      originalPrompt: input.prompt,
      enhancedPrompt: 'A cinematic view of a red bicycle',
      brandId: 'brand',
      brandMode: 'approved_brand',
      brandRevisionId: 'revision-approved',
      brandRevisionVersion: 3,
      status: 'applied',
      source: 'request',
      appliedPacks: [{ id: 'public-pack', version: '1.2.3' }],
    });
    expect(JSON.stringify(receipt)).not.toContain('Private guidance');
    expect(promptEnhancement.enhance).toHaveBeenCalledWith({
      actorUserId: 'user',
      organizationId: input.organizationId,
      brandId: input.brandId,
      userPrompt: input.prompt,
      promptId: undefined,
      model: input.model,
      contentType: input.contentType,
    });
  });

  it('announces applied media instructions but excludes non-prompt pack fields', async () => {
    const { service, harness } = setup();
    harness.resolveBrief.mockResolvedValue({
      appliedPacks: ['public-pack'],
      systemDirectives: ['Keep the product logo accurate'],
      styleDirectives: ['Use warm lighting'],
      guardrails: ['Avoid misleading product claims'],
      evaluationCriteria: ['Internal evaluation rubric'],
      providerHints: ['Internal routing hint'],
      sources: [],
      metadata: { contentType: 'image' },
    });
    const receipt = await service.enhance(input);
    expect(receipt.enhancedPrompt).toContain('Use warm lighting');
    expect(receipt.enhancedPrompt).toContain('Keep the product logo accurate');
    expect(receipt.enhancedPrompt).toContain('Avoid misleading product claims');
    expect(JSON.stringify(receipt)).not.toContain('Internal evaluation rubric');
    expect(JSON.stringify(receipt)).not.toContain('Internal routing hint');
  });

  describe('stops instead of degrading to the raw prompt', () => {
    const sensitive = 'private prompt and brand guidance from provider error';

    async function stopOf(
      run: Promise<unknown>,
    ): Promise<MediaPromptBrandEnhancementException> {
      const error = await run.then(
        () => undefined,
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(MediaPromptBrandEnhancementException);
      return error as MediaPromptBrandEnhancementException;
    }

    it('stops with a typed 502 and never calls the model when the harness brief is unavailable', async () => {
      const { service, harness, promptEnhancement } = setup();
      harness.resolveBrief.mockResolvedValue(null);
      const error = await stopOf(service.enhance(input));
      expect(error.stage).toBe('brief');
      expect(error.getStatus()).toBe(502);
      expect(error.getResponse()).toMatchObject({
        code: MEDIA_PROMPT_BRAND_ENHANCEMENT_FAILED_ERROR_CODE,
      });
      expect(promptEnhancement.enhance).not.toHaveBeenCalled();
    });

    it('stops when no brand identity can be pinned and runs no enhancement work', async () => {
      const { service, snapshots, harness, promptEnhancement } = setup();
      snapshots.preview.mockRejectedValue(
        new ConflictException('brand_identity_unavailable'),
      );
      const error = await stopOf(service.enhance(input));
      expect(error.stage).toBe('brand_identity');
      expect(harness.resolveBrief).not.toHaveBeenCalled();
      expect(promptEnhancement.enhance).not.toHaveBeenCalled();
    });

    it.each([
      'brand_identity',
      'brief',
      'provider',
      'response',
      'receipt',
    ] as const)(
      'stops and logs only sanitized diagnostics for %s failures',
      async (stage) => {
        const { service, harness, promptEnhancement, packs, modes, logger } =
          setup();
        if (stage === 'brand_identity')
          modes.resolve.mockRejectedValue(new Error(sensitive));
        if (stage === 'brief')
          harness.resolveBrief.mockRejectedValue(new Error(sensitive));
        if (stage === 'provider')
          promptEnhancement.enhance.mockRejectedValue(new Error(sensitive));
        if (stage === 'response')
          promptEnhancement.enhance.mockRejectedValue(
            new PromptEnhancementResponseError(),
          );
        if (stage === 'receipt')
          packs.listLoadedPackVersions.mockRejectedValue(new Error(sensitive));
        const error = await stopOf(
          service.enhance({
            ...input,
            prompt: sensitive,
            model: sensitive,
            contentType: 'video',
          }),
        );
        expect(error.stage).toBe(stage);
        expect(JSON.stringify(error.getResponse())).not.toContain(sensitive);
        const diagnostics = {
          contentType: 'video',
          model: 'admin/default-text',
          stage,
          error: expect.any(String),
        };
        const message =
          'Media prompt brand enhancement failed; generation stopped';
        if (stage === 'provider') {
          // An unreachable text model is an operator configuration error.
          expect(logger.error).toHaveBeenCalledExactlyOnceWith(
            message,
            undefined,
            diagnostics,
          );
          expect(logger.warn).not.toHaveBeenCalled();
        } else {
          expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
            message,
            diagnostics,
          );
          expect(logger.error).not.toHaveBeenCalled();
        }
        expect(
          JSON.stringify([
            ...logger.warn.mock.calls,
            ...logger.error.mock.calls,
          ]),
        ).not.toContain('Private guidance');
      },
    );

    it('classifies shared enhancer output validation failures as response failures', async () => {
      const { service, promptEnhancement, logger } = setup();
      promptEnhancement.enhance.mockRejectedValue(
        new PromptEnhancementResponseError(),
      );
      const error = await stopOf(service.enhance(input));
      expect(error.stage).toBe('response');
      expect(logger.warn).toHaveBeenCalledWith(
        'Media prompt brand enhancement failed; generation stopped',
        expect.objectContaining({ stage: 'response' }),
      );
    });

    it('does not hide an authorization failure behind an enhancement stop', async () => {
      const { service, modes } = setup();
      const denied = new ForbiddenException('Brand access denied');
      modes.resolve.mockRejectedValue(denied);
      await expect(service.enhance(input)).rejects.toBe(denied);
    });
  });

  describe('brand identity', () => {
    it('pins an approved revision through the snapshot seam and the brief', async () => {
      const { service, modes, snapshots, harness } = setup();
      const receipt = await service.enhance({
        ...input,
        isApiKey: true,
        apiKeyId: 'key-1',
        scopes: ['generate'],
      });
      expect(modes.resolve).toHaveBeenCalledWith(
        {
          userId: 'user',
          organizationId: 'org',
          isApiKey: true,
          apiKeyId: 'key-1',
          scopes: ['generate'],
        },
        'brand',
      );
      expect(snapshots.preview).toHaveBeenCalledWith({
        organizationId: 'org',
        brandId: 'brand',
        actorId: 'user',
        isApiKey: true,
        apiKeyId: 'key-1',
        scopes: ['generate'],
      });
      expect(snapshots.previewProvisional).not.toHaveBeenCalled();
      expect(harness.resolveBrief).toHaveBeenCalledWith(
        expect.objectContaining({ brandRevisionId: 'revision-approved' }),
      );
      expect(receipt).toMatchObject({
        brandMode: 'approved_brand',
        brandRevisionId: 'revision-approved',
        brandRevisionVersion: 3,
        status: 'applied',
      });
    });

    it('pins the live draft provisionally when no revision is approved', async () => {
      const { service, modes, snapshots, harness } = setup();
      modes.resolve.mockResolvedValue({
        mode: 'provisional_brand',
        draftRevisionId: 'revision-draft',
      });
      const receipt = await service.enhance(input);
      expect(snapshots.previewProvisional).toHaveBeenCalledWith(
        expect.objectContaining({ brandId: 'brand', actorId: 'user' }),
        'revision-draft',
      );
      expect(snapshots.preview).not.toHaveBeenCalled();
      expect(harness.resolveBrief).toHaveBeenCalledWith(
        expect.objectContaining({ brandRevisionId: 'revision-draft' }),
      );
      expect(receipt).toMatchObject({
        brandMode: 'provisional_brand',
        brandRevisionId: 'revision-draft',
        brandRevisionVersion: 4,
      });
    });
  });

  describe('explicit raw mode', () => {
    it('sends the prompt as typed with no brand work, even when enhancement is on', async () => {
      const { service, modes, snapshots, harness, promptEnhancement, packs } =
        setup();
      const receipt = await service.enhance({ ...input, brandMode: 'raw' });
      expect(receipt).toEqual({
        originalPrompt: input.prompt,
        enhancedPrompt: input.prompt,
        brandId: 'brand',
        brandMode: 'raw',
        status: 'skipped',
        source: 'request',
        appliedPacks: [],
      });
      expect(modes.resolve).not.toHaveBeenCalled();
      expect(snapshots.preview).not.toHaveBeenCalled();
      expect(harness.resolveBrief).not.toHaveBeenCalled();
      expect(promptEnhancement.enhance).not.toHaveBeenCalled();
      expect(packs.listLoadedPackVersions).not.toHaveBeenCalled();
    });

    it('rejects selected skills and Knowledge instead of silently dropping them', async () => {
      const { service } = setup();
      await expect(
        service.enhance({
          ...input,
          brandMode: 'raw',
          requestedSkillSlugs: ['cinema'],
        }),
      ).rejects.toThrow('generate without brand');
      await expect(
        service.enhance({
          ...input,
          brandMode: 'raw',
          knowledgeSelection: { sourceIds: ['source-1'] },
        }),
      ).rejects.toThrow('generate without brand');
    });
  });
  it('folds existing harness guidance locally without sending it to the text enhancer', async () => {
    const { service, harness, promptEnhancement } = setup();
    const privateGuidance = 'Private brand rendering guidance';
    harness.resolveBrief.mockResolvedValue({
      appliedPacks: ['public-pack'],
      systemDirectives: [privateGuidance],
      styleDirectives: [],
      guardrails: [],
      sources: [],
      metadata: { contentType: 'video' },
    });
    const receipt = await service.enhance({
      ...input,
      brandId: 'selected-brand',
      contentType: 'video',
    });
    expect(receipt.enhancedPrompt).toContain(privateGuidance);
    expect(receipt.originalPrompt).toBe(input.prompt);
    expect(harness.resolveBrief).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'selected-brand',
        organizationId: input.organizationId,
      }),
    );
    expect(promptEnhancement.enhance).toHaveBeenCalledWith({
      actorUserId: 'user',
      organizationId: input.organizationId,
      brandId: 'selected-brand',
      userPrompt: input.prompt,
      contentType: 'video',
      model: input.model,
    });
    expect(JSON.stringify(promptEnhancement.enhance.mock.calls)).not.toContain(
      privateGuidance,
    );
    expect(harness.formatBrief).not.toHaveBeenCalled();
  });
  it.each(['image', 'video'] as const)(
    'requests only media-applicable packs for %s prompts',
    async (contentType) => {
      const { service, harness } = setup();
      await service.enhance({ ...input, contentType });
      expect(harness.resolveBrief).toHaveBeenCalledWith(
        expect.objectContaining({ contentType, surface: 'media' }),
      );
    },
  );

  describe('copywriting harness rules', () => {
    const LEAKED_RULES = [
      'Attach to demand that already exists',
      'Assume the first three seconds decide everything',
    ];

    async function enhanceWithRealPacks(contentType: 'image' | 'video') {
      const logger: Partial<LoggerService> = {
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      };
      const config: Partial<ConfigService> = { get: vi.fn() };
      const brands: Partial<BrandsService> = {
        findOne: vi.fn().mockResolvedValue({ id: 'brand', label: 'Brand' }),
      };
      const profiles: Partial<HarnessProfilesService> = {
        resolveContributionForBrand: vi.fn().mockResolvedValue(null),
      };
      const settings: Partial<GenerationHarnessSettingsService> = {
        get: vi.fn().mockResolvedValue({ isEnabled: true, source: 'brand' }),
      };
      const promptEnhancement: Partial<PromptEnhancementService> = {
        enhance: vi.fn().mockResolvedValue({
          result: 'A red bicycle at dawn',
          tokensUsed: 1,
          isByok: false,
        }),
      };
      const contentHarness = new ContentHarnessService(
        config as ConfigService,
        logger as LoggerService,
      );
      const harness = new HarnessGenerationService(
        contentHarness,
        logger as LoggerService,
        brandAccessFixture(),
        brands as BrandsService,
        profiles as HarnessProfilesService,
      );
      const service = new MediaPromptEnhancementService(
        settings as GenerationHarnessSettingsService,
        harness,
        contentHarness,
        promptEnhancement as PromptEnhancementService,
        {
          resolve: vi.fn().mockResolvedValue({ mode: 'approved_brand' }),
        } as never,
        {
          preview: vi.fn().mockResolvedValue({
            revisionId: 'revision-approved',
            revisionVersion: 1,
          }),
        } as never,
        logger as LoggerService,
      );
      const receipt = await service.enhance({ ...input, contentType });
      const copyBrief = await harness.resolveBrief({
        brandId: input.brandId,
        contentType: 'post',
        organizationId: input.organizationId,
      });
      return { copyBrief, receipt };
    }

    it.each(['video', 'image'] as const)(
      'keeps persuasion rules out of the %s provider prompt',
      async (contentType) => {
        const { copyBrief, receipt } = await enhanceWithRealPacks(contentType);

        expect(receipt.status).toBe('applied');
        expect(receipt.enhancedPrompt).toContain('A red bicycle at dawn');
        for (const rule of LEAKED_RULES) {
          expect(receipt.enhancedPrompt).not.toContain(rule);
        }
        expect(receipt.appliedPacks.map((pack) => pack.id)).not.toContain(
          'viral-psychology',
        );
        // Copy generation still gets the pack.
        expect(copyBrief?.appliedPacks).toContain('viral-psychology');
      },
    );
  });
});

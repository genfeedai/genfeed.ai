import type { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import { WorkflowMediaProviderPlanService } from '@api/collections/workflows/services/workflow-media-provider-plan.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { runImageGenerationBrief } from '@api/services/generation-brief';
import type { AuthorizedMediaUrlService } from '@api/services/media-urls/authorized-media-url.service';
import type { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { personasServiceStub } from '@api/shared/testing/personas-service.stub';
import { IngredientCategory, ModelCategory } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import {
  createExecutableActionNode,
  type ExecutionContext,
} from '@genfeedai/workflows/engine';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it, vi } from 'vitest';

vi.mock(
  '@api/collections/workflows/services/workflow-engine-executor-helper.service',
  () => ({ WorkflowEngineExecutorHelperService: class {} }),
);
vi.mock('@api/services/files-microservice/client/files-client.service', () => ({
  FilesClientService: class {},
}));
vi.mock('@api/services/prompt-builder/prompt-builder.service', () => ({
  PromptBuilderService: class {},
}));
vi.mock('@libs/logger/logger.service', () => ({ LoggerService: class {} }));

const context: ExecutionContext = {
  organizationId: 'org-1',
  userId: 'user-1',
  runId: 'run-1',
  workflowId: 'workflow-1',
  workflowVersionId: 'version-1',
};
function fixture() {
  const sideEffects = {
    createAndLinkProcessingOutput: vi.fn(),
    createWorkflowOutputIngredient: vi.fn(),
    createProviderContinuation: vi.fn(),
  };
  const requireMediaAsset = vi.fn().mockResolvedValue({
    id: 'identity-1',
    brandId: 'brand-1',
    category: IngredientCategory.IMAGE,
  });
  const helper = {
    ...sideEffects,
    requireMediaAsset,
    requireBrandId: (brandId: unknown) => String(brandId),
    hasOrganizationAsset: async () => true,
    extractIngredientId: (value: unknown) =>
      typeof value === 'string'
        ? value.match(/\/(?:videos|images)\/([^/?#]+)/i)?.[1]
        : undefined,
    buildMediaIngredientUrl: (id: string) => `https://api.test/images/${id}`,
  } as unknown as WorkflowEngineExecutorHelperService;
  const buildPrompt = vi.fn().mockResolvedValue({
    input: { prompt: 'legacy-built', width: 512, height: 512 },
  });
  const getPresignedDownloadUrl = vi
    .fn()
    .mockResolvedValue('https://storage.test/source.mp4?signed=1');
  const config = { isAuthorizedMediaDeliveryEnabled: false };
  const mediaIssuer = { issueServerPublish: vi.fn() };
  const personas = personasServiceStub();
  const service = new WorkflowMediaProviderPlanService(
    helper,
    { warn: vi.fn() } as unknown as LoggerService,
    personas,
    { buildPrompt } as unknown as PromptBuilderService,
    { getPresignedDownloadUrl } as unknown as FilesClientService,
    config as unknown as ConfigService,
    mediaIssuer as unknown as AuthorizedMediaUrlService,
  );
  return {
    config,
    mediaIssuer,
    personas,
    service,
    buildPrompt,
    getPresignedDownloadUrl,
    requireMediaAsset,
    sideEffects,
  };
}

function node(
  actionId: 'imageGen' | 'videoGen',
  parameters: Record<string, unknown>,
) {
  return createExecutableActionNode({
    actionId,
    id: 'media-1',
    parameters: { brandId: 'brand-1', ...parameters },
  });
}

describe('WorkflowMediaProviderPlanService character admission (#6040)', () => {
  const imageNode = node('imageGen', {
    model: MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL,
    prompt: 'portrait',
  });

  it('refuses an image node whose character the brand lost, before any output exists', async () => {
    const f = fixture();
    vi.mocked(f.personas.resolveCharacterReferences).mockRejectedValueOnce(
      new NotFoundException('Reference image'),
    );

    await expect(
      f.service.prepareNode(
        imageNode,
        new Map([['image', 'https://api.test/images/avatar-1']]),
        context,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(f.personas.resolveCharacterReferences).toHaveBeenCalledWith({
      brandId: 'brand-1',
      ingredientIds: ['avatar-1'],
      organizationId: 'org-1',
      path: 'workflow',
    });
    for (const effect of Object.values(f.sideEffects))
      expect(effect).not.toHaveBeenCalled();
  });

  it('links the admitted character to the image output', async () => {
    const f = fixture();
    vi.mocked(f.personas.resolveCharacterReferences).mockResolvedValueOnce({
      availableAvatarIds: new Set(['avatar-1']),
      grantedAvatarOwners: new Map(),
      personaId: 'persona-1',
      personaIdByAssetId: new Map(),
    });

    const prepared = await f.service.prepareNode(
      imageNode,
      new Map([['image', 'https://api.test/images/avatar-1']]),
      context,
    );

    expect(prepared.output.personaId).toBe('persona-1');
  });

  it('refuses a video node whose identity reference or source video is a lost character', async () => {
    const f = fixture();
    vi.mocked(f.personas.resolveCharacterReferences).mockRejectedValueOnce(
      new NotFoundException('Reference image'),
    );

    await expect(
      f.service.prepareVideo({
        context,
        model: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
        node: node('videoGen', {}),
        params: {
          brandId: 'brand-1',
          identityReferences: [{ assetId: 'avatar-1', role: 'character' }],
          parentIngredientId: 'video-1',
          prompt: 'extend',
        },
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(f.personas.resolveCharacterReferences).toHaveBeenCalledWith(
      expect.objectContaining({
        ingredientIds: expect.arrayContaining(['avatar-1', 'video-1']),
        path: 'workflow',
      }),
    );
    expect(f.requireMediaAsset).not.toHaveBeenCalled();
  });
});

describe('WorkflowMediaProviderPlanService internal media URL forms (#6037)', () => {
  const imageNode = node('imageGen', {
    model: MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL,
    prompt: 'portrait',
  });

  it.each([
    'https://CDN.genfeed.ai/ingredients/images/avatar-1',
    'https://cdn.genfeed.ai./ingredients/images/avatar-1',
    'https://cdn.genfeed.ai/ingredients/%69mages/avatar-1?sig=1',
    'https://API.genfeed.ai/images/avatar-1',
  ])('authorizes %s like its canonical form', async (url) => {
    const f = fixture();
    Object.assign(f.config, {
      apiUrl: 'https://api.genfeed.ai',
      cdnUrl: 'https://cdn.genfeed.ai',
      ingredientsEndpoint: 'https://cdn.genfeed.ai/ingredients',
    });
    const helper = (
      f.service as unknown as {
        helper: { hasOrganizationAsset: ReturnType<typeof vi.fn> };
      }
    ).helper;
    helper.hasOrganizationAsset = vi.fn().mockResolvedValue(false);

    await expect(
      f.service.prepareNode(imageNode, new Map([['image', url]]), context),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(helper.hasOrganizationAsset).toHaveBeenCalledWith(
      'avatar-1',
      'org-1',
    );
  });

  it('fails closed for an internal-host URL with no resolvable asset', async () => {
    const f = fixture();
    Object.assign(f.config, { cdnUrl: 'https://cdn.genfeed.ai' });

    await expect(
      f.service.prepareNode(
        imageNode,
        new Map([['image', 'https://CDN.genfeed.ai/ingredients/oops']]),
        context,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('WorkflowMediaProviderPlanService internal media URLs (#6037)', () => {
  const imageNode = node('imageGen', {
    model: MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL,
    prompt: 'portrait',
  });
  const urlInputs = new Map([['image', 'https://api.test/images/avatar-1']]);

  function withHelper(hasAsset: boolean) {
    const f = fixture();
    const helper = (
      f.service as unknown as {
        helper: { hasOrganizationAsset: ReturnType<typeof vi.fn> };
      }
    ).helper;
    helper.hasOrganizationAsset = vi.fn().mockResolvedValue(hasAsset);
    return { f, helper };
  }

  it('refuses an internal media URL of another organization with no active grant', async () => {
    const { f, helper } = withHelper(false);

    await expect(
      f.service.prepareNode(imageNode, urlInputs, context),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(helper.hasOrganizationAsset).toHaveBeenCalledWith(
      'avatar-1',
      'org-1',
    );
    for (const effect of Object.values(f.sideEffects))
      expect(effect).not.toHaveBeenCalled();
  });

  it('allows an internal media URL of the running organization', async () => {
    const { f } = withHelper(true);

    await expect(
      f.service.prepareNode(imageNode, urlInputs, context),
    ).resolves.toMatchObject({ actionId: 'imageGen' });
  });

  it('allows the reference image of a character with an active grant without an organization lookup', async () => {
    const { f, helper } = withHelper(false);
    vi.mocked(f.personas.resolveCharacterReferences).mockResolvedValueOnce({
      availableAvatarIds: new Set(['avatar-1']),
      grantedAvatarOwners: new Map([['avatar-1', 'org-owner']]),
      personaId: 'persona-g',
      personaIdByAssetId: new Map(),
    });

    await expect(
      f.service.prepareNode(imageNode, urlInputs, context),
    ).resolves.toMatchObject({ actionId: 'imageGen' });
    expect(helper.hasOrganizationAsset).not.toHaveBeenCalled();
  });

  it('admits bare asset ids on the video path instead of synthetic reference names', async () => {
    const { f } = withHelper(true);
    vi.mocked(f.personas.resolveCharacterReferences).mockRejectedValueOnce(
      new NotFoundException('Reference image'),
    );

    await expect(
      f.service.prepareVideo({
        context,
        model: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
        node: node('videoGen', {}),
        params: {
          brandId: 'brand-1',
          lastFrame: 'avatar-2',
          prompt: 'walk',
          references: ['avatar-1'],
        },
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    const { ingredientIds } = vi.mocked(f.personas.resolveCharacterReferences)
      .mock.calls[0][0];
    expect(ingredientIds).toEqual(['avatar-1', 'avatar-2']);
  });
});

describe('WorkflowMediaProviderPlanService', () => {
  it('prepares the actual image envelope with upstream precedence and final reference/strength patches without creating output or dispatch', async () => {
    const f = fixture();
    const prepared = await f.service.prepareNode(
      node('imageGen', {
        model: MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL,
        prompt: 'stored',
        image: 'stored-image',
        strength: 0.4,
      }),
      new Map([
        ['prompt', 'upstream'],
        ['image', 'https://api.test/images/ref-1'],
      ]),
      context,
    );
    const compiled = runImageGenerationBrief({
      model: MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL,
      objective: 'upstream',
      height: 1024,
      width: 1024,
      referenceIds: [],
      surface: 'workflow',
    });
    expect(prepared.input).toEqual({
      ...compiled.dispatch,
      image: 'https://api.test/images/ref-1',
      strength: 0.4,
    });
    expect(prepared.input.num_outputs).toBe(1);
    expect(prepared.generationBriefEvidence).toEqual(compiled.evidence);
    expect(prepared.output).toMatchObject({
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'user-1',
      generationPrompt: 'upstream',
      generationSource: compiled.generationSource,
    });
    expect(prepared.target).toEqual({
      model: MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL,
    });
    expect(f.buildPrompt).not.toHaveBeenCalled();
    for (const effect of Object.values(f.sideEffects))
      expect(effect).not.toHaveBeenCalled();
  });

  it('retains the real prompt-builder fallback and immutable version target for exempt image models', async () => {
    const f = fixture();
    const prepared = await f.service.prepareNode(
      node('imageGen', {
        model: 'private/model:exact-version',
        prompt: 'legacy',
        seed: 0,
      }),
      new Map(),
      context,
    );
    expect(f.buildPrompt).toHaveBeenCalledWith(
      'private/model:exact-version',
      expect.objectContaining({
        height: 1024,
        width: 1024,
        prompt: 'legacy',
        seed: 0,
        modelCategory: ModelCategory.IMAGE,
      }),
      undefined,
    );
    expect(prepared.input).toEqual({
      prompt: 'legacy-built',
      width: 512,
      height: 512,
    });
    expect(prepared.target).toEqual({ version: 'exact-version' });
    expect(prepared.generationBriefEvidence).toMatchObject({
      status: 'exempted',
      compilerVersion: null,
      profileVersion: null,
    });
  });

  it('keeps exempt video input as prompt only instead of inventing node dimensions or output cardinality', async () => {
    const f = fixture();
    const prepared = await f.service.prepareNode(
      node('videoGen', {
        model: 'private/video:version',
        prompt: 'legacy',
        duration: 8,
        width: 1280,
        height: 720,
      }),
      new Map(),
      context,
    );
    expect(prepared.input).toEqual({ prompt: 'legacy' });
    expect(prepared).not.toHaveProperty('quantities');
    expect(prepared).not.toHaveProperty('quote');
    expect(f.buildPrompt).not.toHaveBeenCalled();
    for (const effect of Object.values(f.sideEffects))
      expect(effect).not.toHaveBeenCalled();
  });

  it('refreshes canonical tenant video references before dispatch when activated', async () => {
    const f = fixture();
    f.config.isAuthorizedMediaDeliveryEnabled = true;
    f.mediaIssuer.issueServerPublish.mockResolvedValue(
      new Map([
        ['source-video-1', 'https://storage.test/opaque-video?Signature=fresh'],
      ]),
    );
    const prepared = await f.service.prepareNode(
      node('videoGen', {
        model: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
        prompt: 'extend',
        actionVerb: 'extend',
        duration: 8,
        parentIngredientId: 'source-video-1',
      }),
      new Map([['videoReference', 'https://api.test/videos/source-video-1']]),
      context,
    );
    expect(f.mediaIssuer.issueServerPublish).toHaveBeenCalledWith('org-1', [
      'source-video-1',
    ]);
    expect(prepared.input).toMatchObject({
      reference_videos: ['https://storage.test/opaque-video?Signature=fresh'],
    });
    expect(f.getPresignedDownloadUrl).not.toHaveBeenCalled();
  });

  it('keeps native extension duration unknown and resolves references before returning the exact provider input', async () => {
    const f = fixture();
    const prepared = await f.service.prepareNode(
      node('videoGen', {
        model: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
        prompt: 'extend',
        actionVerb: 'extend',
        duration: 8,
        parentIngredientId: 'source-video-1',
      }),
      new Map([['videoReference', 'https://api.test/videos/source-video-1']]),
      context,
    );
    expect(prepared.input).toMatchObject({
      aspect_ratio: 'adaptive',
      duration: -1,
      reference_videos: ['https://storage.test/source.mp4?signed=1'],
    });
    expect(prepared.output).toMatchObject({
      parentIngredientId: 'source-video-1',
      references: ['source-video-1'],
    });
    expect(f.getPresignedDownloadUrl).toHaveBeenCalledWith(
      'source-video-1',
      'videos',
    );
  });

  it('rejects foreign-brand identity references during preparation before any output exists', async () => {
    const f = fixture();
    f.requireMediaAsset.mockResolvedValueOnce({
      id: 'identity-1',
      brandId: 'foreign-brand',
      category: IngredientCategory.IMAGE,
    });
    await expect(
      f.service.prepareNode(
        node('videoGen', {
          model: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
          identityReferences: [{ assetId: 'identity-1', role: 'character' }],
        }),
        new Map(),
        context,
      ),
    ).rejects.toThrow('does not belong to the run brand');
    expect(f.requireMediaAsset).toHaveBeenCalledWith('identity-1', 'org-1', [
      IngredientCategory.IMAGE,
      IngredientCategory.AVATAR,
    ]);
    for (const effect of Object.values(f.sideEffects))
      expect(effect).not.toHaveBeenCalled();
  });

  it('exposes preparation availability and rejects actions without this provider preparation contract', async () => {
    const f = fixture();
    expect(f.service.canPrepareImage).toBe(true);
    await expect(
      f.service.prepareNode(
        createExecutableActionNode({ actionId: 'upscale', id: 'upscale-1' }),
        new Map(),
        context,
      ),
    ).rejects.toThrow('No direct media preparation contract');
    const absent = new WorkflowMediaProviderPlanService(
      {} as WorkflowEngineExecutorHelperService,
      {} as LoggerService,
      personasServiceStub(),
    );
    expect(absent.canPrepareImage).toBe(false);
    await expect(
      absent.prepareNode(
        node('imageGen', {
          model: MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL,
        }),
        new Map(),
        context,
      ),
    ).rejects.toThrow('prompt preparation is unavailable');
  });
});

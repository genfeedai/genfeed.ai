import { AgentMediaTransformService } from '@api/services/agent-orchestrator/tools/agent-media-transform.service';
import { MEDIA_TRANSFORM_OPERATIONS } from '@genfeedai/actions';
import { IngredientCategory } from '@genfeedai/contracts';
import { describe, expect, it, vi } from 'vitest';

const context = {
  brandId: 'brand-1',
  organizationId: 'organization-1',
  userId: 'user-1',
};

const success = (data: Record<string, unknown> = {}) => ({
  creditsUsed: 0,
  data,
  success: true,
});

function createService() {
  const assetGeneration = {
    editImage: vi.fn().mockResolvedValue(success({ id: 'edited-1' })),
    reframeImage: vi.fn().mockResolvedValue(success({ id: 'reframed-1' })),
    upscaleImage: vi.fn().mockResolvedValue(success({ id: 'upscaled-1' })),
  };
  const gateway = {
    mergeVideos: vi.fn().mockResolvedValue({
      data: { attributes: { status: 'processing' }, id: 'merged-1' },
    }),
  };
  const service = new AgentMediaTransformService(
    assetGeneration as never,
    gateway as never,
  );
  return { assetGeneration, gateway, service };
}

function expectNoWork(
  owners: ReturnType<typeof createService>['assetGeneration'] &
    ReturnType<typeof createService>['gateway'],
) {
  for (const method of Object.values(owners)) {
    expect(method).not.toHaveBeenCalled();
  }
}

describe('AgentMediaTransformService operation routing', () => {
  it('routes edit to image editing without the operation key and tags an image result', async () => {
    const { assetGeneration, service } = createService();

    const result = await service.transformMedia(
      { imageId: 'source-1', operation: 'edit', prompt: 'Change the sign' },
      context,
    );

    expect(assetGeneration.editImage).toHaveBeenCalledWith(
      { imageId: 'source-1', prompt: 'Change the sign' },
      context,
    );
    expect(result).toMatchObject({
      data: { id: 'edited-1', kind: 'image' },
      success: true,
    });
  });

  it('routes reframe and tags an image result', async () => {
    const { assetGeneration, service } = createService();

    const result = await service.transformMedia(
      { aspectRatio: '9:16', imageId: 'source-1', operation: 'reframe' },
      context,
    );

    expect(assetGeneration.reframeImage).toHaveBeenCalledWith(
      { aspectRatio: '9:16', imageId: 'source-1' },
      context,
    );
    expect(result.data).toMatchObject({ id: 'reframed-1', kind: 'image' });
  });

  it('routes upscale by image URL and tags an image result', async () => {
    const { assetGeneration, service } = createService();

    const result = await service.transformMedia(
      { imageUrl: 'https://cdn.example.com/a.png', operation: 'upscale' },
      context,
    );

    expect(assetGeneration.upscaleImage).toHaveBeenCalledWith(
      { imageUrl: 'https://cdn.example.com/a.png' },
      context,
    );
    expect(result.data).toMatchObject({ id: 'upscaled-1', kind: 'image' });
  });

  it('does not tag a failed result', async () => {
    const { assetGeneration, service } = createService();
    assetGeneration.editImage.mockResolvedValue({
      creditsUsed: 0,
      error: 'Image editing failed',
      success: false,
    });

    const result = await service.transformMedia(
      { imageId: 'source-1', operation: 'edit', prompt: 'x' },
      context,
    );

    expect(result).toEqual({
      creditsUsed: 0,
      error: 'Image editing failed',
      success: false,
    });
  });

  it.each([
    ['a missing operation', {}],
    ['an unknown operation', { operation: 'crop' }],
    ['a legacy tool name as the operation', { operation: 'edit_image' }],
  ])('rejects %s', async (_label, params) => {
    const { assetGeneration, gateway, service } = createService();

    const result = await service.transformMedia(params, context);

    expect(result).toEqual({
      creditsUsed: 0,
      error: `operation must be one of: ${MEDIA_TRANSFORM_OPERATIONS.join(', ')}`,
      success: false,
    });
    expectNoWork({ ...assetGeneration, ...gateway });
  });
});

describe('AgentMediaTransformService inapplicable parameters', () => {
  it.each([
    [
      'merge fields on edit',
      { imageId: 'i', ids: ['a', 'b'], operation: 'edit', prompt: 'p' },
      'ids does not apply to operation edit',
    ],
    [
      'a prompt on reframe',
      { imageId: 'i', operation: 'reframe', prompt: 'p' },
      'prompt does not apply to operation reframe',
    ],
    [
      'imageId on upscale',
      { imageId: 'i', imageUrl: 'https://x.test/a.png', operation: 'upscale' },
      'imageId does not apply to operation upscale',
    ],
    [
      'image fields on merge',
      { ids: ['a', 'b'], imageId: 'i', operation: 'merge', prompt: 'p' },
      'imageId, prompt do not apply to operation merge',
    ],
  ])('rejects %s', async (_label, params, message) => {
    const { assetGeneration, gateway, service } = createService();

    const result = await service.transformMedia(params, context);

    expect(result).toEqual({ creditsUsed: 0, error: message, success: false });
    expectNoWork({ ...assetGeneration, ...gateway });
  });

  it('ignores null and undefined values for inapplicable fields', async () => {
    const { assetGeneration, service } = createService();

    const result = await service.transformMedia(
      {
        ids: undefined,
        imageId: 'source-1',
        operation: 'edit',
        prompt: 'x',
        transition: null,
      },
      context,
    );

    expect(result.success).toBe(true);
    expect(assetGeneration.editImage).toHaveBeenCalledOnce();
  });
});

describe('AgentMediaTransformService required fields', () => {
  it.each([
    [
      'reframe without imageId',
      { operation: 'reframe' },
      'imageId is required for operation reframe',
    ],
    [
      'reframe with an unsupported ratio',
      { aspectRatio: '21:9', imageId: 'i', operation: 'reframe' },
      'aspectRatio must be one of: 1:1, 16:9, 9:16, 4:3, 3:4 for operation reframe',
    ],
    [
      'upscale without imageUrl',
      { operation: 'upscale' },
      'imageUrl is required for operation upscale',
    ],
    [
      'merge with one clip',
      { ids: ['only'], operation: 'merge' },
      'ids must list at least two video ids',
    ],
    [
      'merge with a blank clip id',
      { ids: ['a', ' '], operation: 'merge' },
      'ids must list at least two video ids',
    ],
  ])('rejects %s', async (_label, params, message) => {
    const { assetGeneration, gateway, service } = createService();

    const result = await service.transformMedia(params, context);

    expect(result).toEqual({ creditsUsed: 0, error: message, success: false });
    expectNoWork({ ...assetGeneration, ...gateway });
  });
});

describe('AgentMediaTransformService merge', () => {
  it('merges through the gateway as the calling user in their organization and brand', async () => {
    const { gateway, service } = createService();

    const result = await service.transformMedia(
      {
        ids: ['clip-1', 'clip-2'],
        isCaptionsEnabled: true,
        music: 'music-1',
        musicVolume: 40,
        operation: 'merge',
        transition: 'fade',
        transitionDuration: 0.5,
      },
      context,
    );

    expect(gateway.mergeVideos).toHaveBeenCalledWith({
      body: {
        category: IngredientCategory.VIDEO,
        ids: ['clip-1', 'clip-2'],
        isCaptionsEnabled: true,
        music: 'music-1',
        musicVolume: 40,
        transition: 'fade',
        transitionDuration: 0.5,
      },
      principal: {
        brandId: 'brand-1',
        organizationId: 'organization-1',
        userId: 'user-1',
      },
    });
    expect(result).toMatchObject({
      creditsUsed: 0,
      data: { id: 'merged-1', kind: 'video', status: 'processing' },
      success: true,
    });
    expect(result.isBillingDelegated).toBeUndefined();
    expect(result.nextActions?.[0]).toMatchObject({
      assetId: 'merged-1',
      assetKind: 'video',
      type: 'content_preview_card',
    });
  });

  it('merges without a brand, scoping by organization and user only', async () => {
    const { gateway, service } = createService();

    await service.transformMedia(
      { ids: ['clip-1', 'clip-2'], operation: 'merge' },
      { ...context, brandId: undefined },
    );

    expect(gateway.mergeVideos).toHaveBeenCalledWith({
      body: { category: IngredientCategory.VIDEO, ids: ['clip-1', 'clip-2'] },
      principal: {
        brandId: undefined,
        organizationId: 'organization-1',
        userId: 'user-1',
      },
    });
  });

  it.each([
    ['zoomEaseCurve', { zoomEaseCurve: 'easyinoutexpo' }],
    ['zoomConfigs', { zoomConfigs: [{ clip: 1 }] }],
  ])('rejects %s before any merge starts', async (_field, zoom) => {
    const { gateway, service } = createService();

    const result = await service.transformMedia(
      { ids: ['clip-1', 'clip-2'], operation: 'merge', ...zoom },
      context,
    );

    expect(result).toEqual({
      creditsUsed: 0,
      error: 'Zoom effects are not supported when merging videos',
      success: false,
    });
    expect(gateway.mergeVideos).not.toHaveBeenCalled();
  });

  it('reports a merge that returns no output id', async () => {
    const { gateway, service } = createService();
    gateway.mergeVideos.mockResolvedValue({ data: null });

    const result = await service.transformMedia(
      { ids: ['clip-1', 'clip-2'], operation: 'merge' },
      context,
    );

    expect(result).toEqual({
      creditsUsed: 0,
      error: 'Video merge did not return an output id',
      success: false,
    });
  });

  it('turns a gateway rejection, such as DTO validation or a foreign clip, into a failed result', async () => {
    const { gateway, service } = createService();
    gateway.mergeVideos.mockRejectedValue(new Error('Video clip not found'));

    const result = await service.transformMedia(
      { ids: ['clip-1', 'clip-2'], operation: 'merge' },
      context,
    );

    expect(result).toEqual({
      creditsUsed: 0,
      error: 'Video clip not found',
      success: false,
    });
  });
});

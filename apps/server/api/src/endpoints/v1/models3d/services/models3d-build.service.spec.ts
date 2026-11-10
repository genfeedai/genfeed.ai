import { Models3dBuildService } from '@api/endpoints/v1/models3d/services/models3d-build.service';
import { IngredientStatus } from '@genfeedai/contracts';

vi.mock('@api/endpoints/v1/models3d/utils/grid-tiles.util', () => ({
  cropAngleSheet: vi.fn().mockResolvedValue([
    { data: Buffer.from('a'), index: 0 },
    { data: Buffer.from('b'), index: 1 },
  ]),
}));

const CHILD = {
  createdAt: new Date('2026-11-10T10:00:00Z'),
  id: { toString: () => 'child-1' },
  metadataId: 'meta-2',
  organizationId: 'org-1',
};

function setup(
  sheet: Record<string, unknown> | null = {
    providerData: { models3d: { sourceImageUrl: 'https://x.test/photo.png' } },
    s3Key: 'ing/sheet',
  },
) {
  const filesClient = {
    getPresignedDownloadUrlForObjectKey: vi
      .fn()
      .mockImplementation(async (key: string) => `https://signed/${key}`),
    uploadToS3: vi
      .fn()
      .mockImplementation(async (name: string) => ({ s3Key: `up/${name}` })),
  };
  const ingredients = {
    find: vi.fn().mockResolvedValue([CHILD]),
    findOneSelect: vi.fn().mockResolvedValue(sheet),
  };
  const logger = { error: vi.fn() };
  const metadata = { patch: vi.fn().mockResolvedValue(undefined) };
  const pollQueue = { schedule: vi.fn().mockResolvedValue('job-1') };
  const replicate = { runModel: vi.fn().mockResolvedValue('pred-2') };
  const webhooks = {
    handleFailedGenerationForIngredient: vi.fn().mockResolvedValue(undefined),
  };
  const service = new Models3dBuildService(
    filesClient as never,
    ingredients as never,
    logger as never,
    metadata as never,
    pollQueue as never,
    replicate as never,
    webhooks as never,
  );
  return {
    filesClient,
    ingredients,
    metadata,
    pollQueue,
    replicate,
    service,
    webhooks,
  };
}

describe('Models3dBuildService', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        arrayBuffer: async () => new ArrayBuffer(4),
        ok: true,
        status: 200,
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('startBuild', () => {
    it('does nothing without a funded GLB child', async () => {
      const ctx = setup();
      ctx.ingredients.find.mockResolvedValue([]);

      await ctx.service.startBuild('sheet-1');

      expect(ctx.replicate.runModel).not.toHaveBeenCalled();
    });

    it('looks only for a processing child of the sheet', async () => {
      const ctx = setup();

      await ctx.service.startBuild('sheet-1');

      expect(ctx.ingredients.find).toHaveBeenCalledWith(
        expect.objectContaining({
          parentId: 'sheet-1',
          status: IngredientStatus.PROCESSING,
        }),
      );
    });

    it('sends the photo and the cropped views to the build model', async () => {
      const ctx = setup();

      await ctx.service.startBuild('sheet-1');

      expect(ctx.replicate.runModel).toHaveBeenCalledWith(
        'firtoz/trellis',
        expect.objectContaining({
          images: [
            'https://x.test/photo.png',
            'https://signed/up/child-1-view-0',
            'https://signed/up/child-1-view-1',
          ],
          mesh_simplify: 0.95,
          seed: 42,
          texture_size: 2048,
        }),
        undefined,
        undefined,
        undefined,
        false,
      );
    });

    it('uses the stored upload as the source photo', async () => {
      const ctx = setup({
        providerData: { models3d: { sourceS3Key: 'uploads/source' } },
        s3Key: 'ing/sheet',
      });

      await ctx.service.startBuild('sheet-1');

      const input = ctx.replicate.runModel.mock.calls[0]?.[1] as {
        images: string[];
      };
      expect(input.images[0]).toBe('https://signed/uploads/source');
    });

    it('records the prediction and polls it as a GLB output', async () => {
      const ctx = setup();

      await ctx.service.startBuild('sheet-1');

      expect(ctx.metadata.patch).toHaveBeenCalledWith(
        'meta-2',
        expect.objectContaining({
          externalId: 'pred-2',
          externalProvider: 'replicate',
        }),
      );
      expect(ctx.pollQueue.schedule).toHaveBeenCalledWith(
        expect.objectContaining({
          externalId: 'pred-2',
          ingredientId: 'child-1',
          organizationId: 'org-1',
          outputKey: 'model_file',
        }),
      );
    });

    it.each([
      ['the sheet has no image', { providerData: {}, s3Key: undefined }],
      ['the photo is missing', { providerData: {}, s3Key: 'ing/sheet' }],
    ])('fails the child and never throws when %s', async (_name, sheet) => {
      const ctx = setup(sheet);

      await expect(ctx.service.startBuild('sheet-1')).resolves.toBeUndefined();

      expect(
        ctx.webhooks.handleFailedGenerationForIngredient,
      ).toHaveBeenCalledWith('child-1', expect.any(String));
      expect(ctx.replicate.runModel).not.toHaveBeenCalled();
    });

    it('fails the child when Replicate rejects', async () => {
      const ctx = setup();
      ctx.replicate.runModel.mockRejectedValue(new Error('replicate down'));

      await expect(ctx.service.startBuild('sheet-1')).resolves.toBeUndefined();

      expect(
        ctx.webhooks.handleFailedGenerationForIngredient,
      ).toHaveBeenCalledWith('child-1', expect.any(String));
    });

    it('fails the child when the sheet download fails', async () => {
      const ctx = setup();
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: false, status: 403 }),
      );

      await ctx.service.startBuild('sheet-1');

      expect(
        ctx.webhooks.handleFailedGenerationForIngredient,
      ).toHaveBeenCalled();
      expect(ctx.replicate.runModel).not.toHaveBeenCalled();
    });

    it('fails the child when the poll cannot be scheduled', async () => {
      const ctx = setup();
      ctx.pollQueue.schedule.mockResolvedValue(null);

      await ctx.service.startBuild('sheet-1');

      expect(
        ctx.webhooks.handleFailedGenerationForIngredient,
      ).toHaveBeenCalled();
    });

    it('survives a failure while failing the child', async () => {
      const ctx = setup();
      ctx.replicate.runModel.mockRejectedValue(new Error('replicate down'));
      ctx.webhooks.handleFailedGenerationForIngredient.mockRejectedValue(
        new Error('refund failed'),
      );

      await expect(ctx.service.startBuild('sheet-1')).resolves.toBeUndefined();
    });
  });

  describe('abandonBuild', () => {
    it('fails the funded child so its hold is refunded', async () => {
      const ctx = setup();

      await ctx.service.abandonBuild('sheet-1');

      expect(
        ctx.webhooks.handleFailedGenerationForIngredient,
      ).toHaveBeenCalledWith('child-1', expect.any(String));
    });

    it('does nothing for a sheet with no funded child', async () => {
      const ctx = setup();
      ctx.ingredients.find.mockResolvedValue([]);

      await ctx.service.abandonBuild('sheet-1');

      expect(
        ctx.webhooks.handleFailedGenerationForIngredient,
      ).not.toHaveBeenCalled();
    });
  });
});

import { Models3dService } from '@api/endpoints/v1/models3d/services/models3d.service';
import { IngredientStatus } from '@genfeedai/contracts';
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
} from '@nestjs/common';

const ACTOR = { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' };
const QUOTE = { build: 27, sheet: 50, total: 77 };

function row(
  id: string,
  status: IngredientStatus,
  extra: Record<string, unknown> = {},
) {
  return {
    createdAt: new Date('2026-11-10T10:00:00Z'),
    id: { toString: () => id },
    providerData: { models3d: { credits: 50 } },
    s3Key: `ing/${id}`,
    status,
    ...extra,
  };
}

function setup() {
  let created = 0;
  const billing = {
    hold: vi.fn().mockResolvedValue(undefined),
    quote: vi.fn().mockResolvedValue(QUOTE),
    quoteStep: vi.fn().mockResolvedValue(27),
    release: vi.fn().mockResolvedValue(undefined),
  };
  const build = {
    abandonBuild: vi.fn().mockResolvedValue(undefined),
    startBuild: vi.fn().mockResolvedValue(undefined),
  };
  const filesClient = {
    getPresignedDownloadUrl: vi.fn().mockResolvedValue('https://signed/glb'),
    getPresignedDownloadUrlForObjectKey: vi
      .fn()
      .mockImplementation(async (key: string) => `https://signed/${key}`),
    uploadToS3: vi.fn().mockResolvedValue({ s3Key: 'uploads/source' }),
  };
  const ingredients = {
    find: vi.fn().mockResolvedValue([]),
    findOne: vi.fn().mockResolvedValue(null),
    patch: vi.fn().mockResolvedValue(undefined),
  };
  const logger = { error: vi.fn() };
  const metadata = { patch: vi.fn().mockResolvedValue(undefined) };
  const pollQueue = { schedule: vi.fn().mockResolvedValue('job-1') };
  const replicate = { runModel: vi.fn().mockResolvedValue('pred-1') };
  const shared = {
    createMediaDocumentsInternal: vi.fn().mockImplementation(async () => {
      created += 1;
      return {
        ingredientData: { id: { toString: () => `ing-${created}` } },
        metadataData: { id: { toString: () => `meta-${created}` } },
      };
    }),
  };
  const webhooks = {
    handleFailedGenerationForIngredient: vi.fn().mockResolvedValue(undefined),
  };
  const service = new Models3dService(
    billing as never,
    build as never,
    filesClient as never,
    ingredients as never,
    logger as never,
    metadata as never,
    pollQueue as never,
    replicate as never,
    shared as never,
    webhooks as never,
  );
  return {
    billing,
    build,
    filesClient,
    ingredients,
    metadata,
    pollQueue,
    replicate,
    service,
    shared,
    webhooks,
  };
}

/** Makes `get` resolve the sheet `ing-1` in the given state. */
function renderState(
  ctx: ReturnType<typeof setup>,
  sheetStatus: IngredientStatus,
  childStatus?: IngredientStatus,
) {
  ctx.ingredients.findOne.mockResolvedValue(row('ing-1', sheetStatus));
  ctx.ingredients.find.mockResolvedValue(
    childStatus ? [row('ing-2', childStatus)] : [],
  );
}

describe('Models3dService', () => {
  describe('create', () => {
    it('needs exactly one of imageUrl or file', async () => {
      const { service } = setup();

      await expect(service.create(ACTOR, {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(
        service.create(
          ACTOR,
          { imageUrl: 'https://x.test/a.png' },
          { buffer: Buffer.from('x'), mimetype: 'image/png' },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('quotes before writing any row', async () => {
      const ctx = setup();
      ctx.billing.quote.mockRejectedValue(new Error('PRICING_UNAVAILABLE'));

      await expect(
        ctx.service.create(ACTOR, { imageUrl: 'https://x.test/a.png' }),
      ).rejects.toThrow('PRICING_UNAVAILABLE');

      expect(ctx.shared.createMediaDocumentsInternal).not.toHaveBeenCalled();
      expect(ctx.replicate.runModel).not.toHaveBeenCalled();
    });

    it('runs the sheet step only without build', async () => {
      const ctx = setup();
      renderState(ctx, IngredientStatus.PROCESSING);

      const result = await ctx.service.create(ACTOR, {
        imageUrl: 'https://x.test/a.png',
        prompt: 'a house',
      });

      expect(ctx.billing.hold).toHaveBeenCalledTimes(1);
      expect(ctx.billing.hold).toHaveBeenCalledWith(
        expect.objectContaining({ credits: 50, step: 'sheet' }),
      );
      expect(ctx.replicate.runModel).toHaveBeenCalledWith(
        'google/nano-banana-pro',
        expect.objectContaining({
          image_input: ['https://x.test/a.png'],
          resolution: '2K',
        }),
        undefined,
        undefined,
        undefined,
        false,
      );
      expect(ctx.pollQueue.schedule).toHaveBeenCalledWith(
        expect.not.objectContaining({ chain: expect.anything() }),
      );
      expect(result.status).toBe('sheet_pending');
      expect(result.id).toBe('ing-1');
    });

    it('holds both steps and chains the build with build:true', async () => {
      const ctx = setup();
      renderState(
        ctx,
        IngredientStatus.PROCESSING,
        IngredientStatus.PROCESSING,
      );

      const result = await ctx.service.create(ACTOR, {
        build: true,
        imageUrl: 'https://x.test/a.png',
      });

      expect(result.id).toBe('ing-1');
      expect(ctx.billing.hold).toHaveBeenCalledTimes(2);
      expect(ctx.billing.hold).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          credits: 27,
          ingredientId: 'ing-2',
          step: 'build',
        }),
      );
      expect(ctx.pollQueue.schedule).toHaveBeenCalledWith(
        expect.objectContaining({ chain: { kind: 'models3d-build' } }),
      );
    });

    it('quotes and funds a high-tier build on Rodin and remembers the tier', async () => {
      const ctx = setup();
      ctx.billing.quote.mockResolvedValue({
        build: 134,
        sheet: 50,
        total: 184,
      });
      renderState(
        ctx,
        IngredientStatus.PROCESSING,
        IngredientStatus.PROCESSING,
      );

      await ctx.service.create(ACTOR, {
        build: true,
        imageUrl: 'https://x.test/a.png',
        quality: 'high',
      });

      const [sheetRow, buildRow] =
        ctx.shared.createMediaDocumentsInternal.mock.calls.map(
          ([row]) => row as Record<string, unknown>,
        );
      expect(ctx.billing.quote.mock.calls[0]).toEqual(['org-1', 'high']);
      expect(ctx.billing.hold.mock.calls[1]?.[0]).toMatchObject({
        credits: 134,
        step: 'build',
      });
      expect(sheetRow?.providerData).toMatchObject({
        models3d: { quality: 'high' },
      });
      expect(buildRow?.model).toBe('hyper3d/rodin');
    });

    it('reports the tier a render was started with', async () => {
      const ctx = setup();
      ctx.ingredients.findOne.mockResolvedValue(
        row('ing-1', IngredientStatus.GENERATED, {
          providerData: { models3d: { credits: 50, quality: 'high' } },
        }),
      );

      await expect(ctx.service.get(ACTOR, 'ing-1')).resolves.toMatchObject({
        quality: 'high',
      });
    });

    it('stores an uploaded photo and sends its signed URL to the model', async () => {
      const ctx = setup();
      renderState(ctx, IngredientStatus.PROCESSING);

      const result = await ctx.service.create(
        ACTOR,
        {},
        { buffer: Buffer.from('png'), mimetype: 'image/png' },
      );

      expect(result.id).toBe('ing-1');
      expect(ctx.filesClient.uploadToS3).toHaveBeenCalledWith(
        'ing-1-source',
        'images',
        expect.objectContaining({ contentType: 'image/png' }),
      );
      expect(ctx.replicate.runModel).toHaveBeenCalledWith(
        'google/nano-banana-pro',
        expect.objectContaining({
          image_input: ['https://signed/uploads/source'],
        }),
        undefined,
        undefined,
        undefined,
        false,
      );
    });

    it('calls no model and discards the row when the balance is short', async () => {
      const ctx = setup();
      ctx.billing.hold.mockRejectedValue(new HttpException('short', 402));

      await expect(
        ctx.service.create(ACTOR, { imageUrl: 'https://x.test/a.png' }),
      ).rejects.toMatchObject({ status: 402 });
      await expect(
        ctx.service.create(ACTOR, { imageUrl: 'https://x.test/a.png' }),
      ).rejects.toThrow('short');

      expect(ctx.replicate.runModel).not.toHaveBeenCalled();
      expect(ctx.billing.release).toHaveBeenCalledWith('ing-1', 'org-1');
      expect(ctx.ingredients.patch).toHaveBeenCalledWith('ing-1', {
        isDeleted: true,
      });
    });

    it('discards both rows when the build hold is short', async () => {
      const ctx = setup();
      ctx.billing.hold
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new HttpException('short', 402));

      await expect(
        ctx.service.create(ACTOR, {
          build: true,
          imageUrl: 'https://x.test/a.png',
        }),
      ).rejects.toMatchObject({ status: 402 });

      expect(ctx.replicate.runModel).not.toHaveBeenCalled();
      expect(ctx.billing.release).toHaveBeenCalledWith('ing-1', 'org-1');
      expect(ctx.billing.release).toHaveBeenCalledWith('ing-2', 'org-1');
    });

    it('fails the sheet, refunds the build and answers 502 when Replicate fails', async () => {
      const ctx = setup();
      ctx.replicate.runModel.mockRejectedValue(new Error('replicate down'));

      await expect(
        ctx.service.create(ACTOR, {
          build: true,
          imageUrl: 'https://x.test/a.png',
        }),
      ).rejects.toBeInstanceOf(BadGatewayException);

      expect(
        ctx.webhooks.handleFailedGenerationForIngredient,
      ).toHaveBeenCalledWith('ing-1', expect.any(String));
      expect(ctx.build.abandonBuild).toHaveBeenCalledWith('ing-1');
    });

    it('fails the render when the poll cannot be scheduled', async () => {
      const ctx = setup();
      ctx.pollQueue.schedule.mockResolvedValue(null);

      await expect(
        ctx.service.create(ACTOR, { imageUrl: 'https://x.test/a.png' }),
      ).rejects.toBeInstanceOf(BadGatewayException);

      expect(
        ctx.webhooks.handleFailedGenerationForIngredient,
      ).toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('is not found for a missing or foreign render', async () => {
      const { service } = setup();

      await expect(service.get(ACTOR, 'nope')).rejects.toMatchObject({
        status: 404,
      });
    });

    it('is not found for an image that is not a 3D render', async () => {
      const ctx = setup();
      ctx.ingredients.findOne.mockResolvedValue(
        row('img', IngredientStatus.GENERATED, { providerData: {} }),
      );

      await expect(ctx.service.get(ACTOR, 'img')).rejects.toMatchObject({
        status: 404,
      });
    });

    it.each([
      ['sheet_pending', IngredientStatus.PROCESSING, undefined],
      ['sheet_ready', IngredientStatus.GENERATED, undefined],
      ['building', IngredientStatus.GENERATED, IngredientStatus.PROCESSING],
      ['ready', IngredientStatus.GENERATED, IngredientStatus.GENERATED],
      ['failed', IngredientStatus.FAILED, undefined],
      ['failed', IngredientStatus.GENERATED, IngredientStatus.FAILED],
    ] as const)('derives %s', async (status, sheetStatus, childStatus) => {
      const ctx = setup();
      renderState(ctx, sheetStatus, childStatus);

      await expect(ctx.service.get(ACTOR, 'ing-1')).resolves.toMatchObject({
        id: 'ing-1',
        status,
      });
    });

    it('includes the sheet and signed GLB URLs when ready', async () => {
      const ctx = setup();
      renderState(ctx, IngredientStatus.GENERATED, IngredientStatus.GENERATED);

      const result = await ctx.service.get(ACTOR, 'ing-1');

      expect(result).toMatchObject({
        glbUrl: 'https://signed/ing/ing-2',
        modelIngredientId: 'ing-2',
        sheetUrl: 'https://signed/ing/ing-1',
      });
    });

    it('reports the frozen credits per step', async () => {
      const ctx = setup();
      renderState(ctx, IngredientStatus.GENERATED, IngredientStatus.PROCESSING);
      ctx.ingredients.find.mockResolvedValue([
        row('ing-2', IngredientStatus.PROCESSING, {
          providerData: { models3d: { credits: 27 } },
        }),
      ]);

      await expect(ctx.service.get(ACTOR, 'ing-1')).resolves.toMatchObject({
        credits: { build: 27, sheet: 50 },
      });
    });

    it('reports the failure message', async () => {
      const ctx = setup();
      ctx.ingredients.findOne.mockResolvedValue(
        row('ing-1', IngredientStatus.FAILED, { generationError: 'NSFW' }),
      );

      await expect(ctx.service.get(ACTOR, 'ing-1')).resolves.toMatchObject({
        error: 'NSFW',
        status: 'failed',
      });
    });

    it('scopes every lookup to the caller organization', async () => {
      const ctx = setup();
      renderState(ctx, IngredientStatus.GENERATED);

      const result = await ctx.service.get(ACTOR, 'ing-1');

      expect(result).toMatchObject({ id: 'ing-1', status: 'sheet_ready' });
      expect(ctx.ingredients.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-1' }),
      );
      expect(ctx.ingredients.find).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-1' }),
      );
    });
  });

  describe('startBuild', () => {
    it('holds the build price and starts the build for a finished sheet', async () => {
      const ctx = setup();
      renderState(ctx, IngredientStatus.GENERATED);

      const result = await ctx.service.startBuild(ACTOR, 'ing-1');

      expect(result).toMatchObject({ id: 'ing-1' });
      expect(ctx.billing.quoteStep).toHaveBeenCalledWith(
        'build',
        'org-1',
        'standard',
      );
      expect(ctx.billing.hold).toHaveBeenCalledWith(
        expect.objectContaining({ credits: 27, step: 'build' }),
      );
      expect(ctx.build.startBuild).toHaveBeenCalledWith('ing-1');
    });

    it('answers 409 while the sheet is pending', async () => {
      const ctx = setup();
      renderState(ctx, IngredientStatus.PROCESSING);

      await expect(
        ctx.service.startBuild(ACTOR, 'ing-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(ctx.service.startBuild(ACTOR, 'ing-1')).rejects.toThrow(
        'The angle sheet is not ready yet',
      );
      expect(ctx.billing.hold).not.toHaveBeenCalled();
    });

    it.each([[IngredientStatus.PROCESSING], [IngredientStatus.GENERATED]])(
      'answers 409 when the model is already %s',
      async (childStatus) => {
        const ctx = setup();
        renderState(ctx, IngredientStatus.GENERATED, childStatus);

        await expect(
          ctx.service.startBuild(ACTOR, 'ing-1'),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(ctx.billing.hold).not.toHaveBeenCalled();
      },
    );

    it('answers 409 when the sheet itself failed', async () => {
      const ctx = setup();
      renderState(ctx, IngredientStatus.FAILED);

      await expect(
        ctx.service.startBuild(ACTOR, 'ing-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(ctx.service.startBuild(ACTOR, 'ing-1')).rejects.toThrow(
        'The angle sheet did not render',
      );
    });

    it('retries after a failed build', async () => {
      const ctx = setup();
      renderState(ctx, IngredientStatus.GENERATED, IngredientStatus.FAILED);

      const result = await ctx.service.startBuild(ACTOR, 'ing-1');

      expect(result).toMatchObject({ id: 'ing-1' });
      expect(ctx.build.startBuild).toHaveBeenCalledWith('ing-1');
    });

    it('starts nothing when the balance is short', async () => {
      const ctx = setup();
      renderState(ctx, IngredientStatus.GENERATED);
      ctx.billing.hold.mockRejectedValue(new HttpException('short', 402));

      await expect(
        ctx.service.startBuild(ACTOR, 'ing-1'),
      ).rejects.toMatchObject({ status: 402 });
      await expect(ctx.service.startBuild(ACTOR, 'ing-1')).rejects.toThrow(
        'short',
      );

      expect(ctx.build.startBuild).not.toHaveBeenCalled();
      // The only row this call created is the GLB child.
      expect(ctx.ingredients.patch).toHaveBeenCalledWith('ing-1', {
        isDeleted: true,
      });
    });
  });

  describe('getFileUrl', () => {
    it('returns the signed GLB URL when ready', async () => {
      const ctx = setup();
      renderState(ctx, IngredientStatus.GENERATED, IngredientStatus.GENERATED);

      await expect(ctx.service.getFileUrl(ACTOR, 'ing-1')).resolves.toBe(
        'https://signed/ing/ing-2',
      );
    });

    it('falls back to the model_3ds path without a stored key', async () => {
      const ctx = setup();
      ctx.ingredients.findOne.mockResolvedValue(
        row('ing-1', IngredientStatus.GENERATED),
      );
      ctx.ingredients.find.mockResolvedValue([
        row('ing-2', IngredientStatus.GENERATED, { s3Key: undefined }),
      ]);

      await expect(ctx.service.getFileUrl(ACTOR, 'ing-1')).resolves.toBe(
        'https://signed/glb',
      );
      expect(ctx.filesClient.getPresignedDownloadUrl).toHaveBeenCalledWith(
        'ing-2',
        'model_3ds',
      );
    });

    it('answers 409 until the model is ready', async () => {
      const ctx = setup();
      renderState(ctx, IngredientStatus.GENERATED, IngredientStatus.PROCESSING);

      await expect(
        ctx.service.getFileUrl(ACTOR, 'ing-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(ctx.service.getFileUrl(ACTOR, 'ing-1')).rejects.toThrow(
        'The 3D model is not ready',
      );
    });
  });
});

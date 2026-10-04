import { noCharacterAdmission } from '@api/collections/personas/utils/character-admission.util';
import { CreateVideoDto } from '@api/collections/videos/dto/create-video.dto';
import { CrunVideoGenerationService } from '@api/collections/videos/services/crun-video-generation.service';
import { CrunVideoInputService } from '@api/collections/videos/services/crun-video-input.service';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { VideoGenerationSerializer } from '@genfeedai/serializers';

const brand = '12345678-1234-4234-8234-123456789abc';
const folder = 'abcdef12-1234-4234-8234-123456789abc';
const user = { userId: brand, organizationId: folder, brandId: brand };
const intent = {
  model: 'crun/kling/v2-5-turbo-pro',
  text: 'A bird',
  crunControls: { contractVersion: 'reviewed', guidanceScale: 0 },
  crunQuoteId: 'frozen',
};
function fixture() {
  const input = new CrunVideoInputService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      resolveCharacterReferences: vi
        .fn()
        .mockResolvedValue(noCharacterAdmission()),
    } as never,
  );
  const preview = {
    preview: vi.fn(),
    consume: vi.fn().mockResolvedValue({
      kind: 'replay',
      ingredientIds: ['first', 'second'],
    }),
    assertCurrent: vi.fn(),
  };
  const tasks = { submit: vi.fn(), prepareRows: vi.fn() };
  const shared = { createMediaDocuments: vi.fn() };
  const prisma = {
    model: { findFirst: vi.fn() },
    prompt: { findFirst: vi.fn() },
  };
  const service = new CrunVideoGenerationService(
    preview as never,
    input,
    tasks as never,
    {} as never,
    {} as never,
    shared as never,
    {} as never,
    {
      findOne: vi.fn().mockResolvedValue({ id: 'first', category: 'VIDEO' }),
    } as never,
    prisma as never,
    {} as never,
  );
  return { service, preview, tasks, shared, prisma };
}
async function dtoFrom(body: unknown): Promise<CreateVideoDto> {
  return (await new ValidationPipe().transform(body, {
    type: 'body',
    metatype: CreateVideoDto,
  })) as CreateVideoDto;
}
describe('Crun original HTTP video intent', () => {
  it.each([false, true])(
    'decodes the real serializer and preserves aliases/zero with JSON API=%s',
    async (jsonApi) => {
      const f = fixture();
      const values = { ...intent, brand, folder, waitForCompletion: false };
      const body = jsonApi
        ? VideoGenerationSerializer.serialize(values)
        : values;
      const dto = await dtoFrom(body);
      const result = await f.service.generate(user as never, dto, {
        body,
      } as never);
      expect(f.preview.consume).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId: brand,
          folderId: folder,
          crunControls: { contractVersion: 'reviewed', guidanceScale: 0 },
        }),
        'frozen',
        user,
      );
      expect(result.data).toMatchObject({
        attributes: { pendingIngredientIds: ['first', 'second'] },
      });
      expect(f.preview.preview).not.toHaveBeenCalled();
      expect(f.tasks.submit).not.toHaveBeenCalled();
    },
  );
  it('rejects a root key silently removed by the real DTO pipe before any preparation', async () => {
    const f = fixture();
    const body = { ...intent, unreviewed: true };
    const dto = await dtoFrom(body);
    expect(dto).not.toHaveProperty('unreviewed');
    await expect(
      f.service.generate(user as never, dto, { body } as never),
    ).rejects.toMatchObject({ response: { code: 'CRUN_INVALID_INPUT' } });
    expect(f.preview.consume).not.toHaveBeenCalled();
    expect(f.prisma.model.findFirst).not.toHaveBeenCalled();
    expect(f.shared.createMediaDocuments).not.toHaveBeenCalled();
  });
  it('rejects a nested key stripped by the real controls DTO', async () => {
    const f = fixture();
    const body = {
      ...intent,
      crunControls: { ...intent.crunControls, audio: true },
    };
    const dto = await dtoFrom(body);
    expect(dto.crunControls).not.toHaveProperty('audio');
    await expect(
      f.service.generate(user as never, dto, { body } as never),
    ).rejects.toMatchObject({ response: { code: 'CRUN_INVALID_INPUT' } });
    expect(f.preview.consume).not.toHaveBeenCalled();
  });
  it.each(['brand', 'brandId', 'folder', 'folderId'])(
    'rejects every malformed supplied %s even alongside a valid counterpart',
    async (key) => {
      for (const invalid of [null, false, 0, '', '  ', [], {}]) {
        const f = fixture();
        const body = {
          ...intent,
          brandId: brand,
          brand,
          folderId: folder,
          folder,
          [key]: invalid,
        };
        const dto = await dtoFrom(intent);
        await expect(
          f.service.generate(user as never, dto, { body } as never),
        ).rejects.toMatchObject({ response: { code: 'CRUN_INVALID_INPUT' } });
        expect(f.preview.consume).not.toHaveBeenCalled();
        expect(f.prisma.prompt.findFirst).not.toHaveBeenCalled();
        expect(f.prisma.model.findFirst).not.toHaveBeenCalled();
      }
    },
  );
  it.each([
    null,
    [],
    { ...intent, brandId: brand, brand: folder },
    { ...intent, folderId: folder, folder: brand },
    { ...intent, model: 'crun/google/veo3-1-fast-t2v' },
    { ...intent, crunQuoteId: '' },
    { ...intent, crunQuoteId: 0 },
    { ...intent, waitForCompletion: true },
    { data: { type: 'image', attributes: intent } },
    { data: { type: 'video', attributes: intent, relationships: {} } },
    { data: { type: 'video', attributes: intent }, included: [] },
    { data: { type: 'video', attributes: intent, id: 0 } },
  ])(
    'denies malformed original bodies without consuming a quote: %j',
    async (body) => {
      const f = fixture();
      const dto = await dtoFrom(intent);
      await expect(
        f.service.generate(user as never, dto, { body } as never),
      ).rejects.toMatchObject({ response: { code: 'CRUN_INVALID_INPUT' } });
      expect(f.preview.consume).not.toHaveBeenCalled();
      expect(f.shared.createMediaDocuments).not.toHaveBeenCalled();
    },
  );
  it('prepares one quote with reviewed defaults for a bare non-preview caller', async () => {
    const f = fixture();
    f.prisma.model.findFirst.mockResolvedValue({
      reviewedProviderContractVersion: 'current',
    });
    f.preview.preview.mockResolvedValue({ isAvailable: true, quoteId: 'new' });
    const body = { model: intent.model, text: intent.text };
    await f.service.generate(user as never, await dtoFrom(body), {
      body,
    } as never);
    expect(f.preview.preview).toHaveBeenCalledOnce();
    expect(f.preview.preview).toHaveBeenCalledWith(
      { ...body, crunControls: { contractVersion: 'current' } },
      user,
    );
    expect(f.preview.consume).toHaveBeenCalledWith(
      { ...body, crunControls: { contractVersion: 'current' } },
      'new',
      user,
    );
    expect(f.tasks.submit).not.toHaveBeenCalled();
  });
  it('uses the DTO fallback only for an undefined original body', async () => {
    const f = fixture();
    const dto = await dtoFrom(intent);
    await f.service.generate(user as never, dto, {} as never);
    expect(f.preview.consume).toHaveBeenCalledOnce();
  });
});

describe('Crun in-process DTO fallback presence', () => {
  it.each([null, false, 0, 1])(
    'retains a defined incumbent seed=%j for strict rejection',
    async (seed) => {
      const f = fixture();
      const dto = { ...(await dtoFrom(intent)), seed };
      await expect(
        f.service.generate(user as never, dto as never, {} as never),
      ).rejects.toMatchObject({ response: { code: 'CRUN_INVALID_INPUT' } });
      expect(f.preview.consume).not.toHaveBeenCalled();
    },
  );
  it('retains a defined unknown field in the in-process fallback', async () => {
    const f = fixture();
    const dto = { ...(await dtoFrom(intent)), unknown: false };
    await expect(
      f.service.generate(user as never, dto, {} as never),
    ).rejects.toMatchObject({ response: { code: 'CRUN_INVALID_INPUT' } });
    expect(f.preview.consume).not.toHaveBeenCalled();
  });
  it('does not remove undefined unknown keys from an actual HTTP body', async () => {
    const f = fixture();
    const body = { ...intent, unknown: undefined };
    await expect(
      f.service.generate(user as never, await dtoFrom(intent), {
        body,
      } as never),
    ).rejects.toMatchObject({ response: { code: 'CRUN_INVALID_INPUT' } });
    expect(f.preview.consume).not.toHaveBeenCalled();
  });
});

describe('Crun video output character link', () => {
  it('records the admitted character on every output', async () => {
    const input = {
      resolveOutputPersonaId: vi.fn().mockResolvedValue('persona-1'),
    };
    let index = 0;
    const shared = {
      createMediaDocuments: vi.fn().mockImplementation(async () => ({
        ingredientData: { id: `ingredient-${index++}` },
      })),
    };
    const service = new CrunVideoGenerationService(
      {} as never,
      input as never,
      {} as never,
      { bindOutput: vi.fn() } as never,
      {} as never,
      shared as never,
      { create: vi.fn().mockResolvedValue({ id: 'prompt' }) } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const frozen = {
      brandId: brand,
      intentHash: 'hash',
      quoteId: 'quote',
      request: { model: 'endpoint', input: { prompt: 'A bird' } },
      snapshot: { credits: 0, allocatedCredits: [0, 0] },
    };
    const provider = {
      contractVersion: 'reviewed',
      credentialSource: 'hosted',
      inputHash: 'input',
    };
    const createdIds: string[] = [];
    await service['createBoundOutputs'](
      user as never,
      { ...intent, outputs: 2, references: [] } as never,
      frozen as never,
      provider as never,
      {} as never,
      createdIds,
    );
    expect(createdIds).toEqual(['ingredient-0', 'ingredient-1']);
    expect(input.resolveOutputPersonaId).toHaveBeenCalledTimes(1);
    expect(shared.createMediaDocuments).toHaveBeenCalledTimes(2);
    for (const call of shared.createMediaDocuments.mock.calls)
      expect(call[1]).toMatchObject({ personaId: 'persona-1' });
  });
});

describe('Crun video dispatch compensation', () => {
  function harness() {
    const tasks = {
      findForIngredient: vi.fn(),
      failPrepared: vi.fn().mockResolvedValue(undefined),
    };
    const billing = {
      abortUnsubmittedOutput: vi.fn().mockResolvedValue(undefined),
      recordSubmissionRejection: vi.fn().mockResolvedValue(undefined),
      releasePool: vi.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      ingredient: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const videos = {
      findOne: vi.fn().mockResolvedValue({ id: 'ingredient-0' }),
    };
    const service = new CrunVideoGenerationService(
      {} as never,
      {} as never,
      tasks as never,
      billing as never,
      {} as never,
      {} as never,
      {} as never,
      videos as never,
      prisma as never,
      {} as never,
    );
    const internals = service as unknown as Record<string, unknown>;
    internals.prepareQuoteConsumption = vi.fn().mockResolvedValue({
      raw: {},
      consumed: { kind: 'fresh', quote: { snapshot: {} } },
    });
    internals.reserveFrozenFunding = vi
      .fn()
      .mockResolvedValue({ provider: {}, intent: {} });
    return { service, internals, tasks, billing, prisma };
  }
  const request = { user, originalUrl: '/videos' };

  it('a throw creating the second ingredient fails the first and releases the pool', async () => {
    const h = harness();
    h.internals.createBoundOutputs = vi
      .fn()
      .mockImplementation(async (...args: unknown[]) => {
        (args[5] as string[]).push('ingredient-0');
        throw new Error('create failed');
      });
    h.tasks.findForIngredient.mockResolvedValue(null);
    await expect(
      h.service.generate(user as never, {} as never, request as never),
    ).rejects.toThrow('create failed');
    expect(h.billing.abortUnsubmittedOutput).toHaveBeenCalledWith(
      'ingredient-0',
      folder,
    );
    expect(h.billing.releasePool).toHaveBeenCalledTimes(1);
  });

  it('a throw during submission fails the remaining prepared tasks and releases the pool', async () => {
    const h = harness();
    h.internals.createBoundOutputs = vi
      .fn()
      .mockImplementation(async (...args: unknown[]) => {
        (args[5] as string[]).push('ingredient-0', 'ingredient-1');
        return {
          rows: [],
          ingredients: [
            { ingredientData: { id: 'ingredient-0' } },
            { ingredientData: { id: 'ingredient-1' } },
          ],
        };
      });
    h.internals.submitPreparedOutputs = vi
      .fn()
      .mockRejectedValue(new Error('provider outage'));
    h.tasks.findForIngredient.mockImplementation(
      async (_org: string, id: string) => ({
        id: `task-${id}`,
        state: id === 'ingredient-0' ? 'pending' : 'prepared',
      }),
    );
    await expect(
      h.service.generate(user as never, {} as never, request as never),
    ).rejects.toThrow('provider outage');
    expect(h.tasks.failPrepared).toHaveBeenCalledTimes(1);
    expect(h.billing.recordSubmissionRejection).toHaveBeenCalledWith(
      'ingredient-1',
      folder,
    );
    expect(h.billing.releasePool).toHaveBeenCalledTimes(1);
  });

  it('leaves the success path uncompensated', async () => {
    const h = harness();
    h.internals.createBoundOutputs = vi.fn().mockResolvedValue({
      rows: [],
      ingredients: [{ ingredientData: { id: 'ingredient-0' } }],
    });
    h.internals.submitPreparedOutputs = vi.fn().mockResolvedValue(undefined);
    await h.service.generate(user as never, {} as never, request as never);
    expect(h.tasks.failPrepared).not.toHaveBeenCalled();
    expect(h.billing.abortUnsubmittedOutput).not.toHaveBeenCalled();
    expect(h.billing.releasePool).not.toHaveBeenCalled();
  });
});

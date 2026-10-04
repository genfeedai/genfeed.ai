import { noCharacterAdmission } from '@api/collections/personas/utils/character-admission.util';
import { CreateVideoDto } from '@api/collections/videos/dto/create-video.dto';
import { CrunVideoGenerationService } from '@api/collections/videos/services/crun-video-generation.service';
import { CrunVideoInputService } from '@api/collections/videos/services/crun-video-input.service';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { MetadataExtension } from '@genfeedai/contracts';
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

describe('Crun video dispatch strategy', () => {
  const { service } = fixture();
  const strategy = service['strategy'];
  it('links the references and end frame to each output and counts them', () => {
    const value = { references: ['a', 'b'], endFrame: 'c' } as never;
    expect(strategy.sourceIds(value)).toEqual(['a', 'b', 'c']);
    expect(strategy.referenceCount(value)).toBe(3);
    expect(strategy.sourceIds({} as never)).toEqual([]);
    expect(strategy.referenceCount({} as never)).toBe(0);
  });
  it('compensates a failed funding preflight and writes mp4 outputs', () => {
    expect(strategy.isPreflightCompensated).toBe(true);
    expect(strategy.extension({} as never)).toBe(MetadataExtension.MP4);
  });
});

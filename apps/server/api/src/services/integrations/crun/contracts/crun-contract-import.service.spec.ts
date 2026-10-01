import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  buildCrunContract,
  CrunContractImportService,
} from '@api/services/integrations/crun/contracts/crun-contract-import.service';
import {
  CRUN_IMAGE_MANIFEST,
  CRUN_PRICING_SNAPSHOT,
  CRUN_RESPONSE_CAPTURES,
  CRUN_VIDEO_MANIFEST,
  CRUN_VIDEO_PRICING_SNAPSHOT,
  getCrunPricingSnapshot,
} from '@api/services/integrations/crun/contracts/crun-manifest';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { normalizeCrunInput } from '@genfeedai/helpers';

function inputSchema(raw: unknown): Record<string, unknown> {
  const schema = raw as {
    paths: Record<
      string,
      {
        post: {
          requestBody: {
            content: Record<
              string,
              { schema: { properties: { input: Record<string, unknown> } } }
            >;
          };
        };
      }
    >;
  };
  return schema.paths['/api/v1/client/job/CreateTask'].post.requestBody.content[
    'application/json'
  ].schema.properties.input;
}

describe('bounded Crun image contract import', () => {
  it('pins captured source bytes to the published primary-document hashes', () => {
    for (const [index, file] of [
      'nano-banana-pro.openapi.json',
      'seedream-4-5.openapi.json',
    ].entries()) {
      const bytes = readFileSync(
        new URL(`./fixtures/${file}`, import.meta.url),
      );
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        CRUN_IMAGE_MANIFEST[index].sha256,
      );
    }
    for (const capture of CRUN_RESPONSE_CAPTURES) {
      expect(
        createHash('sha256')
          .update(
            readFileSync(
              new URL(`./fixtures/${capture.file}`, import.meta.url),
            ),
          )
          .digest('hex'),
      ).toBe(capture.sha256);
    }
    expect(CRUN_IMAGE_MANIFEST.map((entry) => entry.key)).toEqual([
      'crun/google/nano-banana-pro',
      'crun/bytedance/seedream-4-5',
    ]);
  });

  it('uses exact supported controls and explicit server-only launch overrides', () => {
    const nano = buildCrunContract(CRUN_IMAGE_MANIFEST[0]);
    const seedream = buildCrunContract(CRUN_IMAGE_MANIFEST[1]);
    expect(nano.fields.img_urls.maxItems).toBe(8);
    expect(seedream.fields.img_urls.maxItems).toBe(14);
    expect(seedream.fields.prompt.maxLength).toBe(5000);
    expect(seedream.fields).not.toHaveProperty('content_moderation');
    expect(seedream.fields).not.toHaveProperty('enhance_prompt');
    expect(normalizeCrunInput(seedream, { prompt: 'test' })).toEqual({
      isValid: true,
      input: {
        prompt: 'test',
        resolution: '2K',
        aspect_ratio: '16:9',
        num_outputs: 1,
        content_moderation: true,
      },
    });
  });

  it('hashes canonical schema order deterministically while changes create a new version', () => {
    const entry = CRUN_IMAGE_MANIFEST[0];
    const raw = structuredClone(entry.openapi);
    const baseline = buildCrunContract(entry).version;
    const reordered = Object.fromEntries(Object.entries(raw).reverse());
    expect(buildCrunContract(entry, reordered).version).toBe(baseline);
    inputSchema(raw).description = 'New provider revision';
    expect(buildCrunContract(entry, raw).version).not.toBe(baseline);
  });

  it.each(['remote', 'cycle', 'depth', 'combinator', 'required'])(
    'quarantines %s semantics',
    (kind) => {
      const entry = CRUN_IMAGE_MANIFEST[0];
      const raw = structuredClone(entry.openapi);
      const input = inputSchema(raw);
      if (kind === 'remote') input.$ref = 'https://other.test/schema';
      if (kind === 'cycle') {
        input.properties = { prompt: { $ref: '#/components/schemas/Loop' } };
        Object.assign(raw.components.schemas, {
          Loop: { $ref: '#/components/schemas/Loop' },
        });
      }
      if (kind === 'depth') {
        let node: Record<string, unknown> = { type: 'string' };
        for (let n = 0; n < 20; n++)
          node = { type: 'object', properties: { nested: node } };
        input.properties = { prompt: node };
      }
      if (kind === 'combinator')
        input.oneOf = [{ type: 'object' }, { type: 'array' }];
      if (kind === 'required')
        input.required = ['prompt', 'new_required_field'];
      expect(() => buildCrunContract(entry, raw)).toThrow(/CRUN_SCHEMA/);
    },
  );

  it('binds price metadata into the reviewed version without treating credits as USD', () => {
    const entry = CRUN_IMAGE_MANIFEST[0];
    expect(
      buildCrunContract(entry, entry.openapi, {
        rates: [{ providerCredits: '99' }],
      }).version,
    ).not.toBe(buildCrunContract(entry).version);
  });

  it('records metadata fetch failure while preserving reviewed execution fields', async () => {
    const updateMany = vi.fn();
    const service = new CrunContractImportService({
      model: { updateMany },
    } as unknown as PrismaService);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('fixture failure')),
    );
    try {
      await service.synchronize();
    } finally {
      vi.unstubAllGlobals();
    }
    expect(updateMany).toHaveBeenCalledTimes(4);
    for (const [call] of updateMany.mock.calls) {
      expect(call.data).toMatchObject({
        providerSyncStatus: 'failed',
        providerSyncFailureCode: 'CRUN_METADATA_FETCH_FAILED',
      });
      expect(call.data).not.toHaveProperty('providerInputSchema');
      expect(call.data).not.toHaveProperty('providerPricingSyncedAt');
      expect(call.where).toMatchObject({
        organizationId: null,
        isDeleted: false,
        provider: 'crun',
      });
    }
  });

  it('dry-run never creates or approves a catalog row', async () => {
    const transaction = vi.fn();
    const service = new CrunContractImportService({
      $transaction: transaction,
    } as unknown as PrismaService);
    const result = await service.importModel(CRUN_IMAGE_MANIFEST[0]);
    expect(result.mappingStatus).toBe('supported');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('applies immutable pending candidates and preserves active reviewed projection during drift', async () => {
    const model = {
      id: 'model-1',
      reviewedProviderContractVersion: 'old-version',
    };
    const tx = {
      model: { upsert: vi.fn().mockResolvedValue(model), update: vi.fn() },
      modelProviderContract: { upsert: vi.fn() },
    };
    const service = new CrunContractImportService({
      $transaction: async (callback: (value: typeof tx) => Promise<void>) =>
        callback(tx),
    } as unknown as PrismaService);
    await service.importModel(CRUN_IMAGE_MANIFEST[0], undefined, true);
    expect(tx.model.upsert.mock.calls[0][0].create).toMatchObject({
      isActive: false,
      isDefault: false,
      organizationId: null,
    });
    expect(tx.modelProviderContract.upsert.mock.calls[0][0].update).toEqual({
      lastSeenAt: expect.any(Date),
    });
    expect(
      tx.modelProviderContract.upsert.mock.calls[0][0].create,
    ).toMatchObject({ currency: 'CRUN_CREDITS', reviewStatus: 'pending' });
    const patch = tx.model.update.mock.calls[0][0].data;
    expect(patch.providerSyncStatus).toBe('review_required');
    expect(patch).not.toHaveProperty('providerInputSchema');
    expect(patch).not.toHaveProperty('providerCostUsd');
    expect(patch).not.toHaveProperty('isActive');
  });
});

describe('Crun exact video candidates and preserved image versions', () => {
  it.each(CRUN_VIDEO_MANIFEST)(
    'pins raw $endpoint bytes and strict video rules',
    (entry) => {
      const file = entry.endpoint.startsWith('kling/')
        ? 'kling-v2-5-turbo-pro.openapi.json'
        : 'veo3-1-fast-t2v.openapi.json';
      expect(
        createHash('sha256')
          .update(readFileSync(new URL(`./fixtures/${file}`, import.meta.url)))
          .digest('hex'),
      ).toBe(entry.sha256);
      const contract = buildCrunContract(entry);
      expect(contract).toMatchObject({
        mediaKind: 'video',
        videoRules: entry.videoRules,
        serverOverrides: {},
      });
      expect(contract.fields).not.toHaveProperty('audio');
      expect(contract.fields).not.toHaveProperty('output_format');
      expect(normalizeCrunInput(contract, { prompt: 'bird' }).isValid).toBe(
        true,
      );
    },
  );
  it('keeps image hashes based on the original four image rows and video hashes endpoint-scoped', () => {
    expect(CRUN_PRICING_SNAPSHOT.rates).toHaveLength(4);
    expect(CRUN_VIDEO_PRICING_SNAPSHOT.rates).toHaveLength(5);
    for (const entry of CRUN_IMAGE_MANIFEST) {
      expect(getCrunPricingSnapshot(entry)).toEqual(CRUN_PRICING_SNAPSHOT);
      expect(buildCrunContract(entry).version).toBe(
        buildCrunContract(entry, entry.openapi, CRUN_PRICING_SNAPSHOT).version,
      );
    }
    for (const entry of CRUN_VIDEO_MANIFEST)
      expect(
        getCrunPricingSnapshot(entry).rates.every(
          (rate) => rate.endpoint === entry.endpoint,
        ),
      ).toBe(true);
  });
  it.each(CRUN_VIDEO_MANIFEST)(
    'imports $endpoint inactive pending and quarantines drift',
    async (entry) => {
      const tx = {
        model: {
          upsert: vi.fn().mockResolvedValue({ id: 'candidate' }),
          update: vi.fn(),
        },
        modelProviderContract: { upsert: vi.fn() },
      };
      const service = new CrunContractImportService({
        $transaction: async (callback: (client: typeof tx) => Promise<void>) =>
          callback(tx),
      } as unknown as PrismaService);
      await service.importModel(entry, undefined, true);
      expect(tx.model.upsert.mock.calls[0]?.[0].create).toMatchObject({
        category: 'VIDEO',
        isActive: false,
        isDefault: false,
      });
      expect(
        tx.modelProviderContract.upsert.mock.calls[0]?.[0].create,
      ).toMatchObject({
        schemaFamily: entry.schemaFamily,
        reviewStatus: 'pending',
        pricingType: 'per-request',
        outputSchema: expect.objectContaining({ type: 'video' }),
      });
      const raw = structuredClone(entry.openapi);
      inputSchema(raw).oneOf = [{ type: 'string' }];
      expect((await service.importModel(entry, raw)).mappingStatus).toBe(
        'quarantined',
      );
    },
  );
});

import {
  canonicalizeBrandedGenerationJsonV1,
  hashBrandedGenerationOperationV1,
  hashBrandedGenerationRequestV1,
  hashBrandedGenerationTextV1,
} from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import { BrandedGenerationPromptStoreService } from '@api/services/branded-generation-receipts/branded-generation-prompt-store.service';
import { BrandedGenerationReceiptAccessService } from '@api/services/branded-generation-receipts/branded-generation-receipt-access.service';
import type { BrandedGenerationCompilerRecipeV1 } from '@api/services/branded-generation-receipts/branded-generation-recompile.types';
import { encodeBrandedGenerationCompilerRecipeV1 } from '@api/services/branded-generation-receipts/branded-generation-recompile-codec.util';
import { brandedGenerationInputV1Schema } from '@genfeedai/contracts/api-types/contracts';
import type {
  BrandedGenerationInputV1,
  BrandedGenerationReceiptV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import type { Prisma } from '@genfeedai/prisma';
import * as credentialCipher from '@libs/crypto/credential-cipher';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { brandAccessFixture } from '@test/helpers/brand-access.fixture';
import { afterEach, describe, expect, it, vi } from 'vitest';

const actor = { organizationId: 'org', brandId: 'brand', actorId: 'user' };
function fixture() {
  const access = new BrandedGenerationReceiptAccessService(
    brandAccessFixture(),
  );
  vi.spyOn(access, 'assertBrand').mockResolvedValue({ isOwnerOrAdmin: false });
  const store = new BrandedGenerationPromptStoreService(access);
  const mock = {
    generationPromptSnapshot: {
      create: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  return {
    access,
    store,
    mock,
    tx: mock as unknown as Prisma.TransactionClient,
  };
}
function receipt(
  reference: BrandedGenerationReceiptV1['prompts']['original'],
): BrandedGenerationReceiptV1 {
  const clock = '2026-10-01T17:00:00.000Z';
  return {
    schemaVersion: 1,
    id: 'receipt',
    ...actor,
    requestKey: 'request',
    candidateIndex: 0,
    requestHash: hashBrandedGenerationTextV1('request'),
    revision: 2,
    state: 'created',
    mode: 'raw',
    surface: 'api',
    contentType: 'post',
    format: 'text',
    createdAt: clock,
    updatedAt: clock,
    snapshot: null,
    resolutionHash: null,
    layers: [],
    learning: null,
    prompts: { original: reference, enhanced: null, compiled: null },
    execution: null,
    artifact: null,
    validation: null,
    compliance: 'not_claimed',
    diagnostics: [],
    costs: [],
    budget: {
      version: 'brand-enforcement-v1',
      maximumGenerationAttempts: 1,
      automaticPaidRetries: 0,
      generationAttemptsUsed: 0,
    },
    isDeleted: false,
  };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
describe('receipt-owned encrypted exact prompt envelopes', () => {
  it.each(['', '  \n\t ', 'Café 😀\r\n'])(
    'roundtrips exact text %j without plaintext persistence',
    async (text) => {
      vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'branded-unit-test-secret');
      const { store, tx, mock } = fixture();
      const prepared = store.prepare(text);
      expect(prepared.reference.retention).toBe('retained');
      expect(prepared.reference.contentHash).toBe(
        hashBrandedGenerationTextV1(text),
      );
      if (!prepared.record) throw new Error('Missing encrypted fixture');
      expect(prepared.record.ciphertext).toMatch(
        /^[a-f0-9]+:[a-f0-9]+:[a-f0-9]+$/i,
      );
      await store.persist(tx, actor, 'receipt', 0, 'original', prepared);
      expect(
        mock.generationPromptSnapshot.create.mock.calls[0][0].data,
      ).not.toHaveProperty('text');
      mock.generationPromptSnapshot.findFirst.mockResolvedValue({
        ...prepared.record,
        format: 'genfeed.branded-generation-prompt.v1',
      });
      expect(
        await store.read(tx, actor, receipt(prepared.reference), 'original'),
      ).toEqual({
        status: 'retained',
        text,
        contentHash: prepared.reference.contentHash,
      });
      expect(
        mock.generationPromptSnapshot.findFirst.mock.calls[0][0].where,
      ).toMatchObject({
        organizationId: 'org',
        brandId: 'brand',
        userId: 'user',
        brandedGenerationReceiptId: 'receipt',
        brandedGenerationReceiptRevision: { lte: 2 },
        isDeleted: false,
      });
    },
  );
  it('missing key is typed unavailable with the exact hash; overflow is rejected', () => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', '');
    const { store } = fixture();
    expect(store.prepare('  ')).toEqual({
      reference: {
        retention: 'unavailable',
        reasonCode: 'prompt_snapshot_unavailable',
        contentHash: hashBrandedGenerationTextV1('  '),
      },
      record: null,
    });
    expect(() => store.prepare('é'.repeat(32769))).toThrow(
      'prompt_payload_out_of_range',
    );
  });
  it('denies foreign readers and handles ciphertext/hash tampering without payload leakage', async () => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'branded-unit-test-secret');
    const { store, tx, mock, access } = fixture();
    const prepared = store.prepare('private fixture');
    if (!prepared.record) throw new Error('Missing encrypted fixture');
    const saved = receipt(prepared.reference);
    await expect(
      store.read(tx, { ...actor, actorId: 'other' }, saved, 'original'),
    ).rejects.toThrow('receipt_access_denied');
    vi.mocked(access.assertBrand).mockResolvedValue({ isOwnerOrAdmin: true });
    mock.generationPromptSnapshot.findFirst.mockResolvedValue({
      ...prepared.record,
      format: 'genfeed.branded-generation-prompt.v1',
      contentHash: hashBrandedGenerationTextV1('other'),
    });
    expect(
      await store.read(tx, { ...actor, actorId: 'other' }, saved, 'original'),
    ).toEqual({ status: 'unavailable', reasonCode: 'prompt_integrity_failed' });
    mock.generationPromptSnapshot.findFirst.mockResolvedValue({
      ...prepared.record,
      format: 'genfeed.branded-generation-prompt.v1',
      ciphertext:
        prepared.record.ciphertext.slice(0, -1) +
        (prepared.record.ciphertext.endsWith('a') ? 'b' : 'a'),
    });
    expect(await store.read(tx, actor, saved, 'original')).toEqual({
      status: 'unavailable',
      reasonCode: 'prompt_integrity_failed',
    });
  });
  it('rejects forged prepared references and scopes irreversible purge', async () => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'branded-unit-test-secret');
    const { store, tx, mock } = fixture();
    const prepared = store.prepare('text');
    await expect(
      store.persist(tx, actor, 'receipt', 1, 'compiled', {
        ...prepared,
        reference: {
          ...prepared.reference,
          contentHash: hashBrandedGenerationTextV1('different'),
        },
      }),
    ).rejects.toThrow('prompt_integrity_failed');
    expect(mock.generationPromptSnapshot.create).not.toHaveBeenCalled();
    await store.purge(tx, actor, 'receipt');
    expect(mock.generationPromptSnapshot.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        brandId: 'brand',
        brandedGenerationReceiptId: 'receipt',
        format: {
          in: [
            'genfeed.branded-generation-prompt.v1',
            'genfeed.branded-generation-compiled.v1',
          ],
        },
        isDeleted: false,
      },
      data: { ciphertext: '', retentionState: 'purged', isDeleted: true },
    });
  });
});

describe('bounded text envelope and ciphertext guards', () => {
  it('roundtrips exact maximum escaped NUL payload with the actual cipher', async () => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'branded-unit-test-secret');
    const { store, tx, mock } = fixture();
    const text = '\0'.repeat(65536);
    const json = canonicalizeBrandedGenerationJsonV1({
      schemaVersion: 1,
      text,
    });
    expect(Buffer.byteLength(json, 'utf8')).toBe(393245);
    const prepared = store.prepare(text);
    if (!prepared.record) throw new Error('Missing encrypted boundary fixture');
    expect(prepared.record.ciphertext).toHaveLength(786556);
    expect(EncryptionUtil.decrypt(prepared.record.ciphertext)).toBe(json);
    mock.generationPromptSnapshot.findFirst.mockResolvedValue({
      ...prepared.record,
      format: 'genfeed.branded-generation-prompt.v1',
    });
    expect(
      await store.read(tx, actor, receipt(prepared.reference), 'original'),
    ).toEqual({
      status: 'retained',
      text,
      contentHash: hashBrandedGenerationTextV1(text),
    });
    expect(() => store.prepare('\0'.repeat(65537))).toThrow(
      'prompt_payload_out_of_range',
    );
  });
  it.each(['"\\Café😀', '', ' \t\n'])(
    'preserves exact escaped text %j',
    (text) => {
      vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'branded-unit-test-secret');
      const prepared = fixture().store.prepare(text);
      if (!prepared.record) throw new Error('Missing encrypted fixture');
      expect(
        JSON.parse(EncryptionUtil.decrypt(prepared.record.ciphertext)).text,
      ).toBe(text);
      expect(prepared.reference.contentHash).toBe(
        hashBrandedGenerationTextV1(text),
      );
    },
  );
  it.each(['oversized', 'odd', 'object'] as const)(
    'rejects %s ciphertext before key lookup, decryption, and persistence',
    async (kind) => {
      vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'branded-unit-test-secret');
      const { store, tx, mock } = fixture();
      const prepared = store.prepare('exact');
      if (!prepared.record) throw new Error('Missing encrypted fixture');
      const coercion = vi.fn();
      const ciphertext =
        kind === 'oversized'
          ? `${'a'.repeat(32)}:${'aa'.repeat(393246)}:${'b'.repeat(32)}`
          : kind === 'odd'
            ? `${'a'.repeat(32)}:a:${'b'.repeat(32)}`
            : { toString: coercion };
      const decrypt = vi.spyOn(EncryptionUtil, 'decrypt');
      const key = vi.spyOn(credentialCipher, 'resolveTokenEncryptionKey');
      mock.generationPromptSnapshot.findFirst.mockResolvedValue({
        ...prepared.record,
        ciphertext,
        format: 'genfeed.branded-generation-prompt.v1',
      });
      expect(
        await store.read(tx, actor, receipt(prepared.reference), 'original'),
      ).toEqual({
        status: 'unavailable',
        reasonCode: 'prompt_integrity_failed',
      });
      await expect(
        store.persist(tx, actor, 'receipt', 0, 'original', {
          ...prepared,
          record: { ...prepared.record, ciphertext: ciphertext as string },
        }),
      ).rejects.toThrow('prompt_integrity_failed');
      expect(decrypt).not.toHaveBeenCalled();
      expect(key).not.toHaveBeenCalled();
      expect(coercion).not.toHaveBeenCalled();
      expect(mock.generationPromptSnapshot.create).not.toHaveBeenCalled();
    },
  );
  it('refuses oversized decrypted plaintext before JSON.parse', async () => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'branded-unit-test-secret');
    const { store, tx, mock } = fixture();
    const prepared = store.prepare('text');
    if (!prepared.record) throw new Error('Missing encrypted fixture');
    mock.generationPromptSnapshot.findFirst.mockResolvedValue({
      ...prepared.record,
      format: 'genfeed.branded-generation-prompt.v1',
    });
    vi.spyOn(EncryptionUtil, 'decrypt').mockReturnValue('a'.repeat(393246));
    const parse = vi.spyOn(JSON, 'parse');
    try {
      expect(
        await store.read(tx, actor, receipt(prepared.reference), 'original'),
      ).toEqual({
        status: 'unavailable',
        reasonCode: 'prompt_integrity_failed',
      });
      expect(parse).not.toHaveBeenCalled();
      expect(store.prepare('text')).toEqual({
        reference: {
          retention: 'unavailable',
          reasonCode: 'prompt_snapshot_unavailable',
          contentHash: hashBrandedGenerationTextV1('text'),
        },
        record: null,
      });
      expect(parse).not.toHaveBeenCalled();
    } finally {
      parse.mockRestore();
    }
  });
  it('turns oversized encryption output into unavailable with the original hash before decrypt', () => {
    const { store } = fixture();
    vi.spyOn(EncryptionUtil, 'encrypt').mockReturnValue(
      `${'a'.repeat(32)}:${'aa'.repeat(393246)}:${'b'.repeat(32)}`,
    );
    const decrypt = vi.spyOn(EncryptionUtil, 'decrypt');
    expect(store.prepare(' exact ')).toEqual({
      reference: {
        retention: 'unavailable',
        reasonCode: 'prompt_snapshot_unavailable',
        contentHash: hashBrandedGenerationTextV1(' exact '),
      },
      record: null,
    });
    expect(decrypt).not.toHaveBeenCalled();
  });
});

function baseline(): BrandedGenerationCompilerRecipeV1[4] {
  return {
    schemaVersion: 1,
    brandFeedback: { status: 'not_applicable', sourceIds: [] },
    global: {
      status: 'not_applicable',
      scope: { format: 'text', objective: 'engagement' },
    },
    privateAccount: {
      mode: 'no_destination',
      configVersion: 'v1',
      synthetic: false,
      application: {
        status: 'unavailable',
        reasonCodes: ['no_destination'],
        privatePolicyApplied: false,
        sharedReleaseApplied: false,
        revalidatedAt: '2026-10-01T00:00:00.000Z',
      },
    },
  };
}

function retainedInput(): BrandedGenerationInputV1 {
  return {
    schemaVersion: 1,
    ...actor,
    requestKey: 'request',
    candidateIndex: 0,
    surface: 'api',
    contentType: 'post',
    format: 'text',
    mode: 'raw',
    originalPrompt: '  original 😀  ',
    provider: 'provider',
    model: 'model',
    generationParameters: {},
    knowledgeSourceIds: [],
    knowledgeSpaceIds: [],
    parentRequestId: 'parent',
    runId: 'run',
  };
}
function compiledFixture() {
  vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'branded-unit-test-secret');
  const f = fixture();
  const input = retainedInput();
  const recipe: BrandedGenerationCompilerRecipeV1 = [
    'snapshot-brief-v1',
    [],
    [],
    [],
    baseline(),
    {},
  ];
  const prepared = f.store.prepareCompiled(
    ' exact compiled 😀 ',
    input,
    recipe,
  );
  if (!prepared.record) throw new Error('Missing compiled cipher fixture');
  const saved = receipt({
    retention: 'unavailable',
    contentHash: hashBrandedGenerationTextV1(input.originalPrompt),
  });
  Object.assign(saved, {
    requestHash: hashBrandedGenerationRequestV1(input),
    parentRequestId: input.parentRequestId,
    runId: input.runId,
  });
  saved.prompts.compiled = prepared.reference;
  f.mock.generationPromptSnapshot.findFirst.mockResolvedValue(prepared.record);
  return { ...f, input, recipe, prepared, saved };
}
describe('bounded compiled recipe retention and compatibility', () => {
  it('roundtrips exact compiled bytes privately and projects only text publicly', async () => {
    const f = compiledFixture();
    const result = await f.store.readCompiled(f.tx, actor, f.saved);
    expect(result).toMatchObject({
      status: 'retained',
      text: ' exact compiled 😀 ',
      retainedInput: f.input,
      compilerRecipe: f.recipe,
    });
    expect(await f.store.read(f.tx, actor, f.saved, 'compiled')).toEqual({
      status: 'retained',
      text: ' exact compiled 😀 ',
      contentHash: f.prepared.reference.contentHash,
    });
    await expect(
      f.store.persist(f.tx, actor, 'receipt', 1, 'original', f.prepared),
    ).rejects.toThrow('prompt_integrity_failed');
    expect(f.mock.generationPromptSnapshot.create).not.toHaveBeenCalled();
  });
  it('rejects input getters before encryption even without a key', () => {
    const f = compiledFixture();
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', '');
    const getter = vi.fn(() => 'model');
    Object.defineProperty(f.input, 'model', { enumerable: true, get: getter });
    const encrypt = vi.spyOn(EncryptionUtil, 'encrypt');
    expect(() => f.store.prepareCompiled('text', f.input, f.recipe)).toThrow(
      'compiler_recipe_invalid',
    );
    expect(getter).not.toHaveBeenCalled();
    expect(encrypt).not.toHaveBeenCalled();
  });
  it('omits only known top-level undefined and rejects nested undefined/cycles/budget overflow', () => {
    const f = compiledFixture();
    expect(
      f.store.prepareCompiled(
        'text',
        { ...f.input, platform: undefined },
        f.recipe,
      ).record,
    ).not.toBeNull();
    for (const parameters of [
      { nested: undefined },
      { value: 'x'.repeat(1048577) },
    ]) {
      expect(() =>
        f.store.prepareCompiled(
          'text',
          {
            ...f.input,
            generationParameters: parameters,
          } as unknown as BrandedGenerationInputV1,
          f.recipe,
        ),
      ).toThrow();
    }
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(() =>
      f.store.prepareCompiled(
        'text',
        {
          ...f.input,
          generationParameters: cycle,
        } as unknown as BrandedGenerationInputV1,
        f.recipe,
      ),
    ).toThrow('compiler_recipe_invalid');
  });
  it('keeps missing-key failure typed and validates current input before crypto', () => {
    const f = compiledFixture();
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', '');
    expect(f.store.prepareCompiled('  ', f.input, f.recipe)).toEqual({
      reference: {
        retention: 'unavailable',
        reasonCode: 'prompt_snapshot_unavailable',
        contentHash: hashBrandedGenerationTextV1('  '),
      },
      record: null,
    });
    expect(() =>
      f.store.prepareCompiled('x'.repeat(65537), f.input, f.recipe),
    ).toThrow('prompt_payload_out_of_range');
    const odd = vi
      .spyOn(EncryptionUtil, 'encrypt')
      .mockReturnValue(`${'a'.repeat(32)}:a:${'b'.repeat(32)}`);
    expect(
      f.store.prepareCompiled('text', f.input, f.recipe).record,
    ).toBeNull();
    expect(odd).toHaveBeenCalled();
  });
  it('roundtrips maximum text and large bounded input and recipe without public disclosure', async () => {
    const f = compiledFixture();
    const input: BrandedGenerationInputV1 = {
      ...f.input,
      originalPrompt: 'p'.repeat(65536),
      generationParameters: { payload: 'x'.repeat(16000) },
      knowledgeSourceIds: Array.from({ length: 256 }, (_, index) =>
        `source-${index}-`.padEnd(256, 's'),
      ),
      knowledgeSpaceIds: Array.from({ length: 256 }, (_, index) =>
        `space-${index}-`.padEnd(256, 'k'),
      ),
    };
    expect(brandedGenerationInputV1Schema.parse(input)).toEqual(input);
    const stages: BrandedGenerationCompilerRecipeV1[2] = [
      [
        {
          kind: 'pack',
          id: 'large-pack',
          version: 'v1',
          status: 'not_applicable',
          evidenceIds: [],
          omittedIds: [],
        },
        Array.from({ length: 16 }, () => ({
          header: 'h',
          content: 'c'.repeat(65536),
          untrusted: false,
          isAtomic: true,
        })),
        Array.from({ length: 16 }, () => []),
      ],
    ];
    const recipe: BrandedGenerationCompilerRecipeV1 = [
      'snapshot-brief-v1',
      [],
      stages,
      [],
      baseline(),
      {},
    ];
    const text = '\0'.repeat(65536);
    const prepared = f.store.prepareCompiled(text, input, recipe);
    if (!prepared.record) throw new Error('Missing maximum fixture');
    f.saved.requestHash = hashBrandedGenerationRequestV1(input);
    f.saved.prompts.original.contentHash = hashBrandedGenerationTextV1(
      input.originalPrompt,
    );
    f.saved.prompts.compiled = prepared.reference;
    f.mock.generationPromptSnapshot.findFirst.mockResolvedValue(
      prepared.record,
    );
    expect(await f.store.readCompiled(f.tx, actor, f.saved)).toMatchObject({
      status: 'retained',
      text,
      retainedInput: input,
      compilerRecipe: recipe,
    });
    expect(await f.store.read(f.tx, actor, f.saved, 'compiled')).toEqual({
      status: 'retained',
      text,
      contentHash: hashBrandedGenerationTextV1(text),
    });
  });
  it('bounds compiled ciphertext before key resolution, decrypt and database create', async () => {
    const f = compiledFixture();
    const key = vi.spyOn(credentialCipher, 'resolveTokenEncryptionKey');
    const decrypt = vi.spyOn(EncryptionUtil, 'decrypt');
    key.mockClear();
    decrypt.mockClear();
    const bad = { ...f.prepared.record, ciphertext: 'a'.repeat(8388675) };
    f.mock.generationPromptSnapshot.findFirst.mockResolvedValue(bad);
    expect(await f.store.readCompiled(f.tx, actor, f.saved)).toEqual({
      status: 'unavailable',
      reasonCode: 'prompt_integrity_failed',
    });
    expect(key).not.toHaveBeenCalled();
    expect(decrypt).not.toHaveBeenCalled();
    if (!f.prepared.record) throw new Error('Missing bounded fixture');
    await expect(
      f.store.persist(f.tx, actor, 'receipt', 1, 'compiled', {
        ...f.prepared,
        record: { ...f.prepared.record, ciphertext: bad.ciphertext },
      }),
    ).rejects.toThrow('prompt_integrity_failed');
    expect(f.mock.generationPromptSnapshot.create).not.toHaveBeenCalled();
  });
  it.each(['text', 'recipe', 'input', 'hash'])(
    'rejects current compiled %s tampering',
    async (kind) => {
      const f = compiledFixture();
      if (!f.prepared.record) throw new Error('Missing tamper fixture');
      const value = JSON.parse(
        EncryptionUtil.decrypt(f.prepared.record.ciphertext),
      );
      if (kind === 'text') value.text += 'changed';
      if (kind === 'recipe')
        value.compilerRecipe[3] = [
          { code: 'changed', severity: 'warning', evidenceIds: [] },
        ];
      if (kind === 'input') value.retainedInput.actorId = 'other';
      if (kind === 'hash')
        value.compilerRecipeHash = hashBrandedGenerationTextV1('wrong');
      f.mock.generationPromptSnapshot.findFirst.mockResolvedValue({
        ...f.prepared.record,
        ciphertext: EncryptionUtil.encrypt(JSON.stringify(value)),
      });
      expect(await f.store.readCompiled(f.tx, actor, f.saved)).toEqual({
        status: 'unavailable',
        reasonCode: 'prompt_integrity_failed',
      });
    },
  );
  it('authorizes explicit purge before any row lookup and preserves historical missing-row behavior', async () => {
    const f = compiledFixture();
    f.saved.prompts.compiled = {
      retention: 'unavailable',
      reasonCode: 'prompt_payload_purged',
      contentHash: f.prepared.reference.contentHash,
    };
    for (const read of [
      () => f.store.readCompiled(f.tx, actor, f.saved),
      () => f.store.read(f.tx, actor, f.saved, 'compiled'),
    ])
      expect(await read()).toEqual({
        status: 'unavailable',
        reasonCode: 'prompt_payload_purged',
      });
    expect(f.mock.generationPromptSnapshot.findFirst).not.toHaveBeenCalled();
    await expect(
      f.store.readCompiled(f.tx, { ...actor, actorId: 'other' }, f.saved),
    ).rejects.toThrow('receipt_access_denied');
    f.saved.prompts.compiled = f.prepared.reference;
    f.mock.generationPromptSnapshot.findFirst.mockResolvedValue(null);
    expect(await f.store.readCompiled(f.tx, actor, f.saved)).toEqual({
      status: 'unavailable',
      reasonCode: 'prompt_snapshot_unavailable',
    });
  });
  it('recognizes only fully bound future wire values without normalizing their version', async () => {
    const f = compiledFixture();
    const recipe = JSON.parse(
      encodeBrandedGenerationCompilerRecipeV1(f.recipe),
    );
    recipe[0] = 'snapshot-brief-v2';
    const value = {
      schemaVersion: 1,
      text: ' exact compiled 😀 ',
      retainedInput: f.input,
      compilerRecipe: recipe,
      compilerRecipeHash: hashBrandedGenerationOperationV1('recompose', {
        compilerRecipe: recipe,
      }),
    };
    f.mock.generationPromptSnapshot.findFirst.mockResolvedValue({
      ...f.prepared.record,
      ciphertext: EncryptionUtil.encrypt(JSON.stringify(value)),
    });
    expect(await f.store.readCompiled(f.tx, actor, f.saved)).toEqual({
      status: 'unavailable',
      reasonCode: 'compiler_recipe_unavailable',
    });
    expect(await f.store.read(f.tx, actor, f.saved, 'compiled')).toEqual({
      status: 'unavailable',
      reasonCode: 'prompt_integrity_failed',
    });
    expect(() => f.store.prepareCompiled('text', f.input, recipe)).toThrow(
      'compiler_recipe_invalid',
    );
    recipe[0] = 'snapshot-brief-v3';
    f.mock.generationPromptSnapshot.findFirst.mockResolvedValue({
      ...f.prepared.record,
      ciphertext: EncryptionUtil.encrypt(JSON.stringify(value)),
    });
    expect(await f.store.readCompiled(f.tx, actor, f.saved)).toEqual({
      status: 'unavailable',
      reasonCode: 'prompt_integrity_failed',
    });
  });
  it.each([
    'snapshot-brief-v01',
    'snapshot-brief-v0',
    'snapshot-brief-v2147483648',
    'foreign-v2',
  ])('rejects invalid future identifier %s', async (version) => {
    const f = compiledFixture();
    const recipe = JSON.parse(
      encodeBrandedGenerationCompilerRecipeV1(f.recipe),
    );
    recipe[0] = version;
    const value = {
      schemaVersion: 1,
      text: ' exact compiled 😀 ',
      retainedInput: f.input,
      compilerRecipe: recipe,
      compilerRecipeHash: hashBrandedGenerationOperationV1('recompose', {
        compilerRecipe: recipe,
      }),
    };
    f.mock.generationPromptSnapshot.findFirst.mockResolvedValue({
      ...f.prepared.record,
      ciphertext: EncryptionUtil.encrypt(JSON.stringify(value)),
    });
    expect(await f.store.readCompiled(f.tx, actor, f.saved)).toEqual({
      status: 'unavailable',
      reasonCode: 'prompt_integrity_failed',
    });
  });
  it.each([128, 129])(
    'isolates future diagnostic count boundary %s',
    async (count) => {
      const f = compiledFixture();
      const recipe = JSON.parse(
        encodeBrandedGenerationCompilerRecipeV1(f.recipe),
      );
      recipe[0] = 'snapshot-brief-v2';
      recipe[3] = Array.from({ length: count }, () => ({
        code: 'diagnostic',
        severity: 'warning',
        message: 'Future recipe diagnostic',
        evidenceIds: [],
      }));
      const value = {
        schemaVersion: 1,
        text: ' exact compiled 😀 ',
        retainedInput: f.input,
        compilerRecipe: recipe,
        compilerRecipeHash: hashBrandedGenerationOperationV1('recompose', {
          compilerRecipe: recipe,
        }),
      };
      f.mock.generationPromptSnapshot.findFirst.mockResolvedValue({
        ...f.prepared.record,
        ciphertext: EncryptionUtil.encrypt(JSON.stringify(value)),
      });
      expect(await f.store.readCompiled(f.tx, actor, f.saved)).toEqual({
        status: 'unavailable',
        reasonCode:
          count === 128
            ? 'compiler_recipe_unavailable'
            : 'prompt_integrity_failed',
      });
      expect(await f.store.read(f.tx, actor, f.saved, 'compiled')).toEqual({
        status: 'unavailable',
        reasonCode: 'prompt_integrity_failed',
      });
    },
  );
  it.each([
    'extra_slot',
    'unavailable_content',
    'duplicate_identity',
    'contribution',
    'oversize',
    'wrong_lineage',
    'wrong_actor',
  ])('fails future integrity for %s', async (kind) => {
    const f = compiledFixture();
    const recipe = JSON.parse(
      encodeBrandedGenerationCompilerRecipeV1(f.recipe),
    );
    recipe[0] = 'snapshot-brief-v2';
    const input = { ...f.input };
    const stage = [
      {
        kind: 'skill',
        id: 'skill',
        version: 1,
        status: 'not_applicable',
        evidenceIds: [],
        omittedIds: [],
      },
      [],
      [],
    ];
    if (kind === 'extra_slot') recipe.push(null);
    if (kind === 'unavailable_content')
      recipe[1] = [
        [
          { ...stage[0], status: 'unavailable' },
          [{ header: 'h', content: 'c', untrusted: false, isAtomic: true }],
          [[]],
        ],
      ];
    if (kind === 'duplicate_identity') recipe[1] = [stage, stage];
    if (kind === 'contribution') recipe[5] = { systemDirectives: ['invented'] };
    if (kind === 'oversize')
      recipe[3] = Array.from({ length: 129 }, () => ({
        code: 'diagnostic',
        severity: 'warning',
        message: 'Future recipe diagnostic',
        evidenceIds: [],
      }));
    if (kind === 'wrong_lineage') input.runId = 'different';
    if (kind === 'wrong_actor') input.actorId = 'other';
    const value = {
      schemaVersion: 1,
      text: ' exact compiled 😀 ',
      retainedInput: input,
      compilerRecipe: recipe,
      compilerRecipeHash: hashBrandedGenerationOperationV1('recompose', {
        compilerRecipe: recipe,
      }),
    };
    f.mock.generationPromptSnapshot.findFirst.mockResolvedValue({
      ...f.prepared.record,
      ciphertext: EncryptionUtil.encrypt(JSON.stringify(value)),
    });
    expect(await f.store.readCompiled(f.tx, actor, f.saved)).toEqual({
      status: 'unavailable',
      reasonCode: 'prompt_integrity_failed',
    });
  });
});

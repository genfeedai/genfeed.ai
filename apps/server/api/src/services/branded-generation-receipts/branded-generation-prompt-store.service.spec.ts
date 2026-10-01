import {
  canonicalizeBrandedGenerationJsonV1,
  hashBrandedGenerationTextV1,
} from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import { BrandedGenerationPromptStoreService } from '@api/services/branded-generation-receipts/branded-generation-prompt-store.service';
import { BrandedGenerationReceiptAccessService } from '@api/services/branded-generation-receipts/branded-generation-receipt-access.service';
import type { BrandedGenerationReceiptV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import type { Prisma } from '@genfeedai/prisma';
import * as credentialCipher from '@libs/crypto/credential-cipher';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { afterEach, describe, expect, it, vi } from 'vitest';

const actor = { organizationId: 'org', brandId: 'brand', actorId: 'user' };
function fixture() {
  const access = new BrandedGenerationReceiptAccessService();
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
        format: 'genfeed.branded-generation-prompt.v1',
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

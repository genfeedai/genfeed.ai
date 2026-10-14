import 'reflect-metadata';
import { BrandedTextGenerationService } from '@api/services/branded-text-generation/branded-text-generation.service';
import type { BrandedTextGenerationRequestV1 } from '@api/services/branded-text-generation/branded-text-generation.types';
import { brandAccessFixture } from '@api/shared/testing/brand-access.fixture';
import type {
  BrandedGenerationInputV1,
  BrandedGenerationReceiptV1,
  BrandedGenerationResolutionV1,
  BrandIdentitySnapshotV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const actor = {
  actorId: 'user-a',
  brandId: 'brand-a',
  organizationId: 'org-a',
};
const input: BrandedGenerationInputV1 = {
  brandId: 'brand-a',
  actorId: 'user-a',
  organizationId: 'org-a',
  candidateIndex: 0,
  contentType: 'post',
  format: 'text',
  generationParameters: { maxTokens: 500, temperature: 0.8 },
  knowledgeSourceIds: [],
  knowledgeSpaceIds: [],
  mode: 'approved_brand',
  model: 'openai/gpt-4o-mini',
  objective: 'engagement',
  originalPrompt: 'Write one twitter post',
  platform: 'twitter',
  provider: 'openrouter',
  requestKey: 'request-1',
  schemaVersion: 1,
  surface: 'api',
};

function receipt(
  state: BrandedGenerationReceiptV1['state'],
  overrides: Record<string, unknown> = {},
): BrandedGenerationReceiptV1 {
  return {
    artifact: null,
    diagnostics: [],
    id: 'receipt-1',
    revision: 0,
    state,
    actorId: 'user-a',
    ...overrides,
  } as unknown as BrandedGenerationReceiptV1;
}
const expired = receipt('blocked', {
  diagnostics: [
    {
      code: 'dispatch_window_expired',
      message: 'Dispatch window expired',
      severity: 'error',
    },
  ],
  revision: 2,
});
const written = (value: BrandedGenerationReceiptV1) => ({
  receipt: value,
  replayed: false,
});

function setup() {
  const receipts = {
    blockExpired: vi.fn().mockResolvedValue(undefined),
    bindArtifact: vi.fn(),
    create: vi.fn().mockResolvedValue(written(receipt('created'))),
    fail: vi.fn(),
    get: vi.fn(),
    recordCompiledResolution: vi
      .fn()
      .mockResolvedValue(written(receipt('resolved', { revision: 1 }))),
    recordDispatch: vi.fn(),
  };
  const snapshots = {
    preview: vi
      .fn()
      .mockResolvedValue({ contentHash: 'h' } as BrandIdentitySnapshotV1),
  };
  const validator = {
    preflightBrandCapabilities: vi
      .fn()
      .mockReturnValue({ diagnostics: [], status: 'supported' }),
  };
  const harness = {
    resolveSnapshotBriefWithRecipe: vi.fn().mockResolvedValue([
      {
        compiledPrompt: 'COMPILED',
        status: 'resolved',
      } as BrandedGenerationResolutionV1,
      ['snapshot-brief-v1'],
    ]),
  };
  const skills = {
    buildSkillPromptSections: vi.fn(),
    resolveActiveSkills: vi.fn().mockResolvedValue([]),
  };
  const openRouter = {
    chatCompletion: vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'Hello world' } }],
      id: 'gen-1',
    }),
  };
  const service = new BrandedTextGenerationService(
    receipts as never,
    snapshots as never,
    {} as never,
    validator as never,
    {} as never,
    harness as never,
    skills as never,
    openRouter as never,
    brandAccessFixture(),
  );
  const request: BrandedTextGenerationRequestV1 = {
    acceptText: vi.fn().mockReturnValue(true),
    initiatingActor: { organizationId: 'org-a', userId: 'user-a' },
    input,
    persistText: vi.fn().mockResolvedValue({ postId: 'post-1' }),
    privateLearning: {
      application: {
        privatePolicyApplied: false,
        reasonCodes: ['no_destination'],
        revalidatedAt: '2026-10-07T00:00:00.000Z',
        sharedReleaseApplied: false,
        status: 'unavailable',
      },
      configVersion: 'v1',
      mode: 'no_destination',
      synthetic: false,
    } as unknown as BrandedTextGenerationRequestV1['privateLearning'],
    resolveApiKey: vi.fn().mockResolvedValue(undefined),
  };
  return { openRouter, receipts, request, service };
}

describe('recordDispatch racing the dispatch window', () => {
  let h: ReturnType<typeof setup>;
  beforeEach(() => {
    h = setup();
  });

  it('blocks a still-resolved receipt as dispatch_window_expired and stops the paid call visibly', async () => {
    h.receipts.recordDispatch.mockRejectedValue(
      new ConflictException('receipt_dispatch_window_expired'),
    );
    h.receipts.get
      .mockResolvedValueOnce(receipt('resolved', { revision: 1 }))
      .mockResolvedValueOnce(expired);

    const outcome = await h.service.generate(h.request);

    expect(h.receipts.blockExpired).toHaveBeenCalledWith(
      actor,
      { id: 'receipt-1', revision: 1 },
      expect.any(Date),
      false,
    );
    expect(h.openRouter.chatCompletion).toHaveBeenCalledTimes(1);
    expect(h.request.persistText).not.toHaveBeenCalled();
    expect(h.receipts.fail).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      hasNewDispatch: true,
      kind: 'stopped',
      postId: null,
      reasonCode: 'dispatch_window_expired',
      receipt: expired,
    });
  });

  it.each([['receipt_version_conflict'], ['receipt_state_conflict']])(
    'reports the same stop when the recovery sweep blocked it first (%s)',
    async (code) => {
      h.receipts.recordDispatch.mockRejectedValue(new ConflictException(code));
      h.receipts.get.mockResolvedValue(expired);

      const outcome = await h.service.generate(h.request);

      expect(h.receipts.blockExpired).not.toHaveBeenCalled();
      expect(outcome).toMatchObject({
        hasNewDispatch: true,
        kind: 'stopped',
        reasonCode: 'dispatch_window_expired',
      });
    },
  );

  it('tolerates the sweep winning the block between the read and the write', async () => {
    h.receipts.recordDispatch.mockRejectedValue(
      new ConflictException('receipt_dispatch_window_expired'),
    );
    h.receipts.get
      .mockResolvedValueOnce(receipt('resolved', { revision: 1 }))
      .mockResolvedValueOnce(expired);
    h.receipts.blockExpired.mockRejectedValue(
      new ConflictException('receipt_version_conflict'),
    );

    await expect(h.service.generate(h.request)).resolves.toMatchObject({
      kind: 'stopped',
      reasonCode: 'dispatch_window_expired',
    });
  });

  it('rethrows the original conflict when the receipt did not expire', async () => {
    const original = new ConflictException('receipt_state_conflict');
    h.receipts.recordDispatch.mockRejectedValue(original);
    h.receipts.get.mockResolvedValue(
      receipt('blocked', {
        diagnostics: [
          {
            code: 'provider_attempt_ref_unavailable',
            message: 'x',
            severity: 'error',
          },
        ],
      }),
    );

    await expect(h.service.generate(h.request)).rejects.toBe(original);
    expect(h.receipts.blockExpired).not.toHaveBeenCalled();
  });

  it('rethrows the window error when blocking left the receipt resolved', async () => {
    const original = new ConflictException('receipt_dispatch_window_expired');
    h.receipts.recordDispatch.mockRejectedValue(original);
    h.receipts.get.mockResolvedValue(receipt('resolved', { revision: 1 }));
    h.receipts.blockExpired.mockRejectedValue(new Error('db down'));

    await expect(h.service.generate(h.request)).rejects.toBe(original);
  });

  it.each([
    [
      'a provider id collision',
      new ConflictException('provider_attempt_ref_conflict'),
    ],
    ['a database failure', new Error('connection reset')],
  ])('does not classify %s as an expiry', async (_label, error) => {
    h.receipts.recordDispatch.mockRejectedValue(error);

    await expect(h.service.generate(h.request)).rejects.toBe(error);
    expect(h.receipts.get).not.toHaveBeenCalled();
    expect(h.receipts.blockExpired).not.toHaveBeenCalled();
  });
});

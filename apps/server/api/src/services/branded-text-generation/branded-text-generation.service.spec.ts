import { brandAccessFixture } from '@api/shared/testing/brand-access.fixture';
import 'reflect-metadata';
import { BrandedTextGenerationService } from '@api/services/branded-text-generation/branded-text-generation.service';
import type { BrandedTextGenerationRequestV1 } from '@api/services/branded-text-generation/branded-text-generation.types';
import { compileSnapshotBriefResolution } from '@api/services/harness/branded-generation-compiler';
import type {
  BrandedGenerationInputV1,
  BrandedGenerationReceiptV1,
  BrandedGenerationResolutionV1,
  BrandIdentitySnapshotV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/services/harness/branded-generation-compiler', () => ({
  compileSnapshotBriefResolution: vi.fn(),
}));

const actor = {
  organizationId: 'org-a',
  brandId: 'brand-a',
  actorId: 'user-a',
};
const input: BrandedGenerationInputV1 = {
  schemaVersion: 1,
  actorId: 'user-a',
  organizationId: 'org-a',
  brandId: 'brand-a',
  requestKey: 'request-1',
  candidateIndex: 0,
  surface: 'api',
  contentType: 'post',
  format: 'text',
  mode: 'approved_brand',
  originalPrompt: 'Write one twitter post',
  provider: 'openrouter',
  model: 'openai/gpt-4o-mini',
  generationParameters: { maxTokens: 500, temperature: 0.8 },
  platform: 'twitter',
  objective: 'engagement',
  knowledgeSourceIds: [],
  knowledgeSpaceIds: [],
};
const privateLearning = {
  mode: 'no_destination',
  configVersion: 'v1',
  synthetic: false,
  application: {
    status: 'unavailable',
    reasonCodes: ['no_destination'],
    privatePolicyApplied: false,
    sharedReleaseApplied: false,
    revalidatedAt: '2026-10-07T00:00:00.000Z',
  },
} as unknown as BrandedTextGenerationRequestV1['privateLearning'];
const snapshot = { contentHash: 'hash-a' } as BrandIdentitySnapshotV1;
const recipe = ['snapshot-brief-v1'] as never;

function receipt(
  state: BrandedGenerationReceiptV1['state'],
  overrides: Record<string, unknown> = {},
): BrandedGenerationReceiptV1 {
  return {
    id: 'receipt-1',
    revision: 0,
    actorId: 'user-a',
    state,
    diagnostics: [],
    artifact: null,
    ...overrides,
  } as unknown as BrandedGenerationReceiptV1;
}
const written = (value: BrandedGenerationReceiptV1, replayed = false) => ({
  receipt: value,
  replayed,
});
const resolved = (compiledPrompt = 'COMPILED'): BrandedGenerationResolutionV1 =>
  ({ status: 'resolved', compiledPrompt }) as BrandedGenerationResolutionV1;
const blockedResolution = {
  status: 'blocked',
} as BrandedGenerationResolutionV1;
const completion = (id: string | undefined, content: string | null) => ({
  id,
  choices: [{ message: { content } }],
});
const binding = { artifact: { id: 'post-1' }, textHash: 'text-hash' };

function setup() {
  const receipts = {
    create: vi.fn(),
    recordResolution: vi.fn(),
    recordCompiledResolution: vi.fn(),
    recordDispatch: vi.fn(),
    blockBeforeDispatch: vi.fn(),
    bindArtifact: vi.fn(),
    fail: vi.fn(),
    recordValidation: vi.fn(),
  };
  const snapshots = { preview: vi.fn() };
  const material = { describePostArtifact: vi.fn() };
  const validator = { preflightBrandCapabilities: vi.fn() };
  const validation = { validateReceipt: vi.fn() };
  const harness = { resolveSnapshotBriefWithRecipe: vi.fn() };
  const skills = {
    resolveActiveSkills: vi.fn(),
    buildSkillPromptSections: vi.fn(),
  };
  const openRouter = { chatCompletion: vi.fn() };
  const service = new BrandedTextGenerationService(
    receipts as never,
    snapshots as never,
    material as never,
    validator as never,
    validation as never,
    harness as never,
    skills as never,
    openRouter as never,
    brandAccessFixture(),
  );
  const request: BrandedTextGenerationRequestV1 = {
    initiatingActor: {
      userId: input.actorId,
      organizationId: input.organizationId,
    },
    input,
    privateLearning,
    resolveApiKey: vi.fn().mockResolvedValue('byok-key'),
    acceptText: vi.fn().mockReturnValue(true),
    persistText: vi.fn().mockResolvedValue({ postId: 'post-1' }),
  };
  return {
    receipts,
    snapshots,
    material,
    validator,
    validation,
    harness,
    skills,
    openRouter,
    service,
    request,
  };
}
type Harness = ReturnType<typeof setup>;

/** A fresh receipt that reaches `resolved` and a provider that accepts. */
function arrangeHappyPath(h: Harness) {
  h.receipts.create.mockResolvedValue(written(receipt('created')));
  h.snapshots.preview.mockResolvedValue(snapshot);
  h.validator.preflightBrandCapabilities.mockReturnValue({
    status: 'supported',
    diagnostics: [],
  });
  h.skills.resolveActiveSkills.mockResolvedValue([]);
  h.harness.resolveSnapshotBriefWithRecipe.mockResolvedValue([
    resolved(),
    recipe,
  ]);
  h.receipts.recordCompiledResolution.mockResolvedValue(
    written(receipt('resolved', { revision: 1 })),
  );
  h.openRouter.chatCompletion.mockResolvedValue(
    completion('gen-1', '  Hello world  '),
  );
  h.receipts.recordDispatch.mockResolvedValue(
    written(receipt('dispatched', { revision: 2 })),
  );
  h.material.describePostArtifact.mockResolvedValue(binding);
  h.receipts.bindArtifact.mockResolvedValue(
    written(receipt('checking', { revision: 3 })),
  );
  h.validation.validateReceipt.mockResolvedValue(
    written(receipt('ready', { revision: 4 })),
  );
}

describe('BrandedTextGenerationService', () => {
  let h: Harness;
  beforeEach(() => {
    vi.clearAllMocks();
    h = setup();
    vi.mocked(compileSnapshotBriefResolution).mockReturnValue(
      blockedResolution,
    );
  });

  describe('fresh generation', () => {
    it('admits the real credit hold after winning resolution and before the provider', async () => {
      arrangeHappyPath(h);
      const admitDispatch = vi.fn(async () => {
        expect(h.receipts.recordCompiledResolution).toHaveBeenCalledOnce();
        expect(h.openRouter.chatCompletion).not.toHaveBeenCalled();
      });
      const reauthorize = vi.fn(async () => undefined);
      await h.service.generate({ ...h.request, admitDispatch, reauthorize });
      expect(admitDispatch).toHaveBeenCalledOnce();
      expect(reauthorize).toHaveBeenCalledTimes(5);
    });
    it('does not dispatch or persist when atomic credit admission rejects the request', async () => {
      arrangeHappyPath(h);
      await expect(
        h.service.generate({
          ...h.request,
          admitDispatch: async () => {
            throw new Error('budget_exhausted');
          },
        }),
      ).rejects.toThrow('budget_exhausted');
      expect(h.openRouter.chatCompletion).not.toHaveBeenCalled();
      expect(h.request.persistText).not.toHaveBeenCalled();
    });
    it('checks the captured continuation before looking up a private provider key', async () => {
      arrangeHappyPath(h);
      await expect(
        h.service.generate({
          ...h.request,
          reauthorize: async () => {
            throw new Error('key_revoked');
          },
        }),
      ).rejects.toThrow('key_revoked');
      expect(h.request.resolveApiKey).not.toHaveBeenCalled();
      expect(h.receipts.create).not.toHaveBeenCalled();
    });
    it('retains the actual accepted provider receipt when the initiator is revoked before artifact creation', async () => {
      arrangeHappyPath(h);
      const reauthorize = vi.fn(async () => {
        if (h.receipts.recordDispatch.mock.calls.length)
          throw new Error('key_revoked');
      });
      await expect(
        h.service.generate({ ...h.request, reauthorize }),
      ).rejects.toThrow('key_revoked');
      expect(h.receipts.recordDispatch).toHaveBeenCalledOnce();
      expect(h.request.persistText).not.toHaveBeenCalled();
      expect(h.receipts.fail).not.toHaveBeenCalled();
    });
    it('generates a complete thread through the same actual receipt, material and quality lifecycle', async () => {
      arrangeHappyPath(h);
      const request = {
        ...h.request,
        input: { ...input, format: 'thread' as const },
      };
      await h.service.generateThread(request);
      expect(h.receipts.create).toHaveBeenCalledWith(request.input);
      expect(
        h.harness.resolveSnapshotBriefWithRecipe.mock.calls[0][5],
      ).toMatchObject({ global: { scope: { format: 'thread' } } });
      expect(h.material.describePostArtifact).toHaveBeenCalledWith(
        actor,
        'post-1',
      );
      expect(h.validation.validateReceipt).toHaveBeenCalledOnce();
      await expect(h.service.generate(request)).rejects.toThrow(
        'brand_format_unsupported',
      );
    });
    it('runs create → resolve → dispatch → bind → validate with one provider call', async () => {
      arrangeHappyPath(h);
      const outcome = await h.service.generate(h.request);

      expect(outcome).toMatchObject({
        kind: 'completed',
        postId: 'post-1',
        text: 'Hello world',
        hasNewDispatch: true,
      });
      expect(outcome.receipt.state).toBe('ready');
      expect(h.request.resolveApiKey).toHaveBeenCalledWith(input.model);
      expect(h.openRouter.chatCompletion).toHaveBeenCalledTimes(1);
      expect(h.openRouter.chatCompletion).toHaveBeenCalledWith(
        {
          model: input.model,
          messages: [{ role: 'user', content: 'COMPILED' }],
          max_tokens: 500,
          temperature: 0.8,
        },
        'byok-key',
      );
      expect(h.receipts.recordCompiledResolution).toHaveBeenCalledWith(
        actor,
        'receipt-1',
        { operationKey: 'receipt-1:resolve', expectedRevision: 0 },
        resolved(),
        input,
        recipe,
      );
      const dispatch = h.receipts.recordDispatch.mock.calls[0];
      expect(dispatch[2]).toEqual({
        operationKey: 'receipt-1:dispatch',
        expectedRevision: 1,
      });
      expect(dispatch[3]).toMatchObject({
        provider: 'openrouter',
        model: input.model,
        providerAttemptRef: 'openrouter:gen-1',
      });
      expect(
        dispatch[3].dispatchClaimedAt <= dispatch[3].providerAcceptedAt,
      ).toBe(true);
      expect(h.request.acceptText).toHaveBeenCalledWith('Hello world');
      expect(h.request.persistText).toHaveBeenCalledWith('Hello world');
      expect(h.receipts.bindArtifact).toHaveBeenCalledWith(
        actor,
        'receipt-1',
        { operationKey: 'receipt-1:bind', expectedRevision: 2 },
        expect.objectContaining({
          ...binding,
          completedAt: expect.any(String),
        }),
      );
      expect(h.validation.validateReceipt).toHaveBeenCalledWith(
        actor,
        'receipt-1',
      );
    });

    it('hands the harness the exact baseline learning application', async () => {
      arrangeHappyPath(h);
      await h.service.generate(h.request);

      const call = h.harness.resolveSnapshotBriefWithRecipe.mock.calls[0];
      expect(call[0]).toEqual(input);
      expect(call[1]).toBe(snapshot);
      expect(call[2]).toEqual([]);
      expect(call[3]).toBeUndefined();
      expect(call[5]).toEqual({
        schemaVersion: 1,
        brandFeedback: { status: 'not_applicable', sourceIds: [] },
        global: {
          status: 'unavailable',
          reasonCode: 'global_learning_unavailable',
          scope: {
            format: 'text',
            objective: 'engagement',
            platform: 'twitter',
          },
        },
        privateAccount: privateLearning,
      });
      expect(call[6]).toEqual({});
      expect(h.skills.resolveActiveSkills).toHaveBeenCalledWith(
        'org-a',
        'brand-a',
        undefined,
        { actorUserId: 'user-a', channel: 'twitter', modality: 'text' },
      );
    });
  });

  describe('preconditions', () => {
    it.each([
      [
        'a non-approved mode',
        { mode: 'raw' as const },
        BadRequestException,
        'brand_mode_unsupported',
      ],
      [
        'a non-text format',
        { format: 'image' as const },
        BadRequestException,
        'brand_format_unsupported',
      ],
      [
        'a non-OpenRouter provider',
        { provider: 'replicate' },
        UnprocessableEntityException,
        'provider_capability_unsupported',
      ],
      [
        'a non-OpenRouter text model',
        { model: 'black-forest-labs/flux-schnell' },
        UnprocessableEntityException,
        'provider_capability_unsupported',
      ],
      [
        'unknown generation parameters',
        { generationParameters: { maxTokens: 500, temperature: 0.8, n: 2 } },
        BadRequestException,
        'generation_parameters_invalid',
      ],
      [
        'an out-of-range temperature',
        { generationParameters: { maxTokens: 500, temperature: 3 } },
        BadRequestException,
        'generation_parameters_invalid',
      ],
    ])(
      'rejects %s before creating a receipt',
      async (_label, override, error, message) => {
        const promise = h.service.generate({
          ...h.request,
          input: { ...input, ...override } as BrandedGenerationInputV1,
        });
        await expect(promise).rejects.toBeInstanceOf(error);
        await expect(promise).rejects.toThrow(message);
        expect(h.receipts.create).not.toHaveBeenCalled();
        expect(h.request.resolveApiKey).not.toHaveBeenCalled();
      },
    );

    it('rejects an invalid input contract before creating a receipt', async () => {
      await expect(
        h.service.generate({
          ...h.request,
          input: { ...input, requestKey: '' },
        }),
      ).rejects.toThrow('branded_generation_input_invalid');
      expect(h.receipts.create).not.toHaveBeenCalled();
    });
  });

  describe('blocked resolution', () => {
    beforeEach(() => {
      h.receipts.create.mockResolvedValue(written(receipt('created')));
      h.receipts.recordResolution.mockResolvedValue(
        written(
          receipt('blocked', {
            revision: 1,
            diagnostics: [
              { code: 'no_approved_revision', severity: 'error', message: 'x' },
            ],
          }),
        ),
      );
    });

    it('records a blocked resolution when no revision is approved and never dispatches', async () => {
      h.snapshots.preview.mockRejectedValue(
        new ConflictException('brand_identity_unavailable'),
      );
      h.harness.resolveSnapshotBriefWithRecipe.mockResolvedValue([
        blockedResolution,
        null,
      ]);
      const outcome = await h.service.generate(h.request);

      expect(
        h.harness.resolveSnapshotBriefWithRecipe.mock.calls[0][1],
      ).toBeNull();
      expect(h.receipts.recordResolution).toHaveBeenCalledTimes(1);
      expect(h.receipts.recordCompiledResolution).not.toHaveBeenCalled();
      expect(h.openRouter.chatCompletion).not.toHaveBeenCalled();
      expect(outcome).toMatchObject({
        kind: 'stopped',
        reasonCode: 'no_approved_revision',
        hasNewDispatch: false,
      });
    });

    it.each([
      'brand_identity_integrity_failed',
      'brand_identity_asset_unavailable',
    ])('blocks on %s without calling preflight', async (code) => {
      h.snapshots.preview.mockRejectedValue(new ConflictException(code));
      const outcome = await h.service.generate(h.request);

      expect(compileSnapshotBriefResolution).toHaveBeenCalledWith(
        input,
        null,
        expect.anything(),
        {},
        [],
        [],
        [],
        [code],
      );
      expect(h.validator.preflightBrandCapabilities).not.toHaveBeenCalled();
      expect(h.openRouter.chatCompletion).not.toHaveBeenCalled();
      expect(outcome.kind).toBe('stopped');
    });

    it('blocks with the first preflight error when the capability is unsupported', async () => {
      h.snapshots.preview.mockResolvedValue(snapshot);
      h.validator.preflightBrandCapabilities.mockReturnValue({
        status: 'blocked',
        diagnostics: [
          { code: 'factual_coverage_unverified', severity: 'warning' },
          { code: 'artifact_font_unverifiable', severity: 'error' },
        ],
      });
      await h.service.generate(h.request);

      expect(compileSnapshotBriefResolution).toHaveBeenCalledWith(
        input,
        snapshot,
        expect.anything(),
        {},
        [],
        [],
        [],
        ['unsupported_capability', 'artifact_font_unverifiable'],
      );
      expect(h.skills.resolveActiveSkills).not.toHaveBeenCalled();
      expect(h.openRouter.chatCompletion).not.toHaveBeenCalled();
    });

    it('rethrows an unrecognized snapshot conflict and records nothing', async () => {
      h.snapshots.preview.mockRejectedValue(new ConflictException('other'));
      await expect(h.service.generate(h.request)).rejects.toThrow('other');
      expect(h.receipts.recordResolution).not.toHaveBeenCalled();
    });

    it('rethrows a non-conflict snapshot error and records nothing', async () => {
      h.snapshots.preview.mockRejectedValue(new Error('database down'));
      await expect(h.service.generate(h.request)).rejects.toThrow(
        'database down',
      );
      expect(h.receipts.recordResolution).not.toHaveBeenCalled();
    });

    it('answers 503 and records nothing when skills cannot be resolved', async () => {
      h.snapshots.preview.mockResolvedValue(snapshot);
      h.validator.preflightBrandCapabilities.mockReturnValue({
        status: 'supported',
        diagnostics: [],
      });
      h.skills.resolveActiveSkills.mockRejectedValue(new Error('skills down'));
      await expect(h.service.generate(h.request)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(h.receipts.recordResolution).not.toHaveBeenCalled();
      expect(h.receipts.recordCompiledResolution).not.toHaveBeenCalled();
      expect(h.openRouter.chatCompletion).not.toHaveBeenCalled();
    });
  });

  describe('dispatch evidence', () => {
    beforeEach(() => {
      arrangeHappyPath(h);
      h.receipts.blockBeforeDispatch.mockResolvedValue(
        written(receipt('blocked', { revision: 2 })),
      );
    });

    it.each([
      [
        'the provider throws',
        () => h.openRouter.chatCompletion.mockRejectedValue(new Error('boom')),
      ],
      [
        'the response has no id',
        () =>
          h.openRouter.chatCompletion.mockResolvedValue(
            completion(undefined, 'text'),
          ),
      ],
      [
        'the attempt reference is not a valid id',
        () =>
          h.openRouter.chatCompletion.mockResolvedValue(
            completion('bad\u0007id', 'text'),
          ),
      ],
    ])('blocks before dispatch when %s', async (_label, arrange) => {
      arrange();
      const outcome = await h.service.generate(h.request);

      expect(h.receipts.blockBeforeDispatch).toHaveBeenCalledWith(
        actor,
        'receipt-1',
        { operationKey: 'receipt-1:block', expectedRevision: 1 },
        'provider_attempt_ref_unavailable',
      );
      expect(h.receipts.recordDispatch).not.toHaveBeenCalled();
      expect(h.request.persistText).not.toHaveBeenCalled();
      expect(h.openRouter.chatCompletion).toHaveBeenCalledTimes(1);
      expect(outcome).toMatchObject({
        kind: 'stopped',
        postId: null,
        reasonCode: 'provider_attempt_ref_unavailable',
        hasNewDispatch: false,
      });
    });
  });

  describe('output handling', () => {
    beforeEach(() => {
      arrangeHappyPath(h);
      h.receipts.fail.mockResolvedValue(
        written(receipt('failed', { revision: 3 })),
      );
    });

    it('fails an empty output without saving or calling the provider again', async () => {
      h.openRouter.chatCompletion.mockResolvedValue(completion('gen-1', '   '));
      const outcome = await h.service.generate(h.request);

      expect(h.receipts.fail).toHaveBeenCalledWith(
        actor,
        'receipt-1',
        { operationKey: 'receipt-1:fail', expectedRevision: 2 },
        {
          reasonCode: 'provider_output_empty',
          completedAt: expect.any(String),
        },
      );
      expect(h.request.persistText).not.toHaveBeenCalled();
      expect(h.openRouter.chatCompletion).toHaveBeenCalledTimes(1);
      expect(outcome).toMatchObject({
        kind: 'stopped',
        reasonCode: 'provider_output_empty',
        hasNewDispatch: true,
      });
    });

    it('fails an output that exceeds the channel limit', async () => {
      vi.mocked(h.request.acceptText).mockReturnValue(false);
      const outcome = await h.service.generate(h.request);

      expect(h.request.persistText).not.toHaveBeenCalled();
      expect(h.openRouter.chatCompletion).toHaveBeenCalledTimes(1);
      expect(outcome).toMatchObject({
        kind: 'stopped',
        reasonCode: 'channel_limit_exceeded',
      });
    });

    it('fails when the text cannot be persisted', async () => {
      vi.mocked(h.request.persistText).mockRejectedValue(new Error('db'));
      const outcome = await h.service.generate(h.request);

      expect(h.receipts.bindArtifact).not.toHaveBeenCalled();
      expect(outcome).toMatchObject({
        kind: 'stopped',
        postId: null,
        reasonCode: 'artifact_persist_failed',
      });
    });

    it('fails and keeps the post id when the artifact cannot be bound', async () => {
      h.receipts.bindArtifact.mockRejectedValue(new Error('mismatch'));
      const outcome = await h.service.generate(h.request);

      expect(h.validation.validateReceipt).not.toHaveBeenCalled();
      expect(outcome).toMatchObject({
        kind: 'stopped',
        postId: 'post-1',
        reasonCode: 'artifact_bind_failed',
      });
    });

    it('fails when describing the artifact throws', async () => {
      h.material.describePostArtifact.mockRejectedValue(new Error('missing'));
      const outcome = await h.service.generate(h.request);

      expect(h.receipts.bindArtifact).not.toHaveBeenCalled();
      expect(outcome).toMatchObject({
        kind: 'stopped',
        postId: 'post-1',
        reasonCode: 'artifact_bind_failed',
      });
    });
  });

  describe('validation', () => {
    beforeEach(() => arrangeHappyPath(h));

    it('records unavailable validation as needs_review when the validator throws', async () => {
      h.validation.validateReceipt.mockRejectedValue(new Error('outage'));
      h.receipts.recordValidation.mockResolvedValue(
        written(receipt('needs_review', { revision: 4 })),
      );
      const outcome = await h.service.generate(h.request);

      expect(h.receipts.recordValidation).toHaveBeenCalledWith(
        actor,
        'receipt-1',
        {
          operationKey: 'receipt-1:validation-unavailable',
          expectedRevision: 3,
        },
        'validate',
        null,
      );
      expect(outcome).toMatchObject({ kind: 'completed' });
      expect(outcome.receipt.state).toBe('needs_review');
    });

    it('leaves the receipt in checking when validation cannot be recorded either', async () => {
      h.validation.validateReceipt.mockRejectedValue(new Error('outage'));
      h.receipts.recordValidation.mockRejectedValue(new Error('outage'));
      const outcome = await h.service.generate(h.request);

      expect(outcome).toMatchObject({ kind: 'completed' });
      expect(outcome.receipt.state).toBe('checking');
    });

    it('reports a hard validation failure as stopped with the saved post', async () => {
      h.validation.validateReceipt.mockResolvedValue(
        written(
          receipt('blocked', {
            revision: 4,
            diagnostics: [
              {
                code: 'mandatory_rule_missing',
                severity: 'error',
                message: 'x',
              },
            ],
          }),
        ),
      );
      const outcome = await h.service.generate(h.request);

      expect(outcome).toMatchObject({
        kind: 'stopped',
        postId: 'post-1',
        reasonCode: 'mandatory_rule_missing',
        hasNewDispatch: true,
      });
    });

    it('refuses to validate a receipt created by another actor', async () => {
      h.receipts.bindArtifact.mockResolvedValue(
        written(receipt('checking', { revision: 3, actorId: 'user-b' })),
      );
      await expect(h.service.generate(h.request)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(h.validation.validateReceipt).not.toHaveBeenCalled();
    });
  });

  describe('replay', () => {
    it.each(['resolved', 'dispatched'] as const)(
      'answers in_progress for a %s receipt without calling the provider',
      async (state) => {
        h.receipts.create.mockResolvedValue(
          written(receipt(state, { revision: 1 }), true),
        );
        const outcome = await h.service.generate(h.request);

        expect(outcome).toMatchObject({
          kind: 'in_progress',
          hasNewDispatch: false,
        });
        expect(h.openRouter.chatCompletion).not.toHaveBeenCalled();
        expect(h.receipts.recordResolution).not.toHaveBeenCalled();
        expect(h.receipts.recordCompiledResolution).not.toHaveBeenCalled();
      },
    );

    it('only validates a receipt that is already checking', async () => {
      h.receipts.create.mockResolvedValue(
        written(
          receipt('checking', { revision: 3, artifact: { id: 'post-1' } }),
          true,
        ),
      );
      h.validation.validateReceipt.mockResolvedValue(
        written(receipt('ready', { revision: 4, artifact: { id: 'post-1' } })),
      );
      const outcome = await h.service.generate(h.request);

      expect(outcome).toMatchObject({
        kind: 'completed',
        postId: 'post-1',
        text: null,
        hasNewDispatch: false,
      });
      expect(h.openRouter.chatCompletion).not.toHaveBeenCalled();
    });

    it.each(['ready', 'needs_review'] as const)(
      'returns the saved post for a %s receipt',
      async (state) => {
        h.receipts.create.mockResolvedValue(
          written(
            receipt(state, { revision: 4, artifact: { id: 'post-1' } }),
            true,
          ),
        );
        const outcome = await h.service.generate(h.request);

        expect(outcome).toMatchObject({
          kind: 'completed',
          postId: 'post-1',
          text: null,
          hasNewDispatch: false,
        });
        expect(h.openRouter.chatCompletion).not.toHaveBeenCalled();
        expect(h.validation.validateReceipt).not.toHaveBeenCalled();
      },
    );

    it.each(['blocked', 'failed', 'cancelled'] as const)(
      'returns the stable reason for a %s receipt',
      async (state) => {
        h.receipts.create.mockResolvedValue(
          written(
            receipt(state, {
              revision: 2,
              diagnostics: [
                { code: 'first', severity: 'error', message: 'x' },
                { code: 'warned', severity: 'warning', message: 'x' },
                { code: 'last_error', severity: 'error', message: 'x' },
              ],
            }),
            true,
          ),
        );
        const outcome = await h.service.generate(h.request);

        expect(outcome).toMatchObject({
          kind: 'stopped',
          reasonCode: 'last_error',
          hasNewDispatch: false,
        });
        expect(h.openRouter.chatCompletion).not.toHaveBeenCalled();
      },
    );

    it('falls back to a generic reason when no error diagnostic exists', async () => {
      h.receipts.create.mockResolvedValue(written(receipt('cancelled'), true));
      const outcome = await h.service.generate(h.request);
      expect(outcome).toMatchObject({
        reasonCode: 'branded_generation_blocked',
      });
    });

    it('stops a concurrent twin whose resolve write was a replay', async () => {
      arrangeHappyPath(h);
      h.receipts.recordCompiledResolution.mockResolvedValue(
        written(receipt('resolved', { revision: 1 }), true),
      );
      const outcome = await h.service.generate(h.request);

      expect(outcome.kind).toBe('in_progress');
      expect(h.openRouter.chatCompletion).not.toHaveBeenCalled();
    });

    it('stops when the dispatch write was a replay', async () => {
      arrangeHappyPath(h);
      h.receipts.recordDispatch.mockResolvedValue(
        written(receipt('dispatched', { revision: 2 }), true),
      );
      const outcome = await h.service.generate(h.request);

      expect(outcome.kind).toBe('in_progress');
      expect(h.request.persistText).not.toHaveBeenCalled();
    });

    it('propagates create conflicts for another actor or payload', async () => {
      h.receipts.create.mockRejectedValue(
        new ConflictException('request_payload_conflict'),
      );
      await expect(h.service.generate(h.request)).rejects.toThrow(
        'request_payload_conflict',
      );
      expect(h.openRouter.chatCompletion).not.toHaveBeenCalled();
    });
  });
});

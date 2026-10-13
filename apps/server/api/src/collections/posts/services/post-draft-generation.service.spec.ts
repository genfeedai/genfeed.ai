import type { LearningResolution } from '@api/collections/content-learning/services/learning-decision.service';
import { LearningDecisionService } from '@api/collections/content-learning/services/learning-decision.service';
import { AccountPublishingContextService } from '@api/collections/credentials/services/account-publishing-context.service';
import { PostDraftGenerationService } from '@api/collections/posts/services/post-draft-generation.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { DEFAULT_MINI_TEXT_MODEL } from '@api/constants/default-mini-text-model.constant';
import { BrandedGenerationBlockedException } from '@api/helpers/exceptions/branded-generation-blocked/branded-generation-blocked.exception';
import { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import { hashBrandedGenerationTextV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import { BrandedModeResolverService } from '@api/services/branded-text-generation/branded-mode-resolver.service';
import { BrandedTextGenerationService } from '@api/services/branded-text-generation/branded-text-generation.service';
import {
  CredentialPlatform,
  PostCategory,
  PostFormat,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { learningGenerationReceiptSchema } from '@genfeedai/contracts/api-types/contracts/content-learning-generation.contract';
import { testId } from '@helpers/testing/test-id.helper';
import { Test } from '@nestjs/testing';
import {
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from 'vitest';

describe('PostDraftGenerationService', () => {
  const userId = testId('user'),
    organizationId = testId('org'),
    brandId = testId('brand');
  const identity = { brandId, id: userId, organizationId, userId };
  const mockPublishingContext = {
    brand: { id: brandId, label: 'Test Brand' },
    constraints: {
      maxWeightedCharacters: 280,
      notes: [],
      usesWeightedCharacters: true,
    },
  };
  const mockAccountPublishingContextService = {
    resolveDraft: vi.fn(),
    resolve: vi.fn(),
  };
  const mockAgentChatModelRegistry = { resolveModelKey: vi.fn() };
  const mockPostsService = { create: vi.fn(), findOne: vi.fn() };
  const mockBrandedText = { generate: vi.fn() };
  const mockModeResolver = { resolve: vi.fn() };
  const blocked = vi.fn(() => {
    throw new Error('Accountless learning must not access persistence');
  });
  function forbidden<T extends object>(): T {
    return new Proxy({} as T, { get: blocked });
  }
  type Dependencies = ConstructorParameters<typeof LearningDecisionService>;
  const decisions = new LearningDecisionService(
    forbidden<Dependencies[0]>(),
    forbidden<Dependencies[1]>(),
    forbidden<Dependencies[2]>(),
    forbidden<Dependencies[3]>(),
    forbidden<Dependencies[4]>(),
    forbidden<Dependencies[5]>(),
  );
  let service: PostDraftGenerationService;
  let resolveLearning: MockInstance<
    LearningDecisionService['resolveForGeneration']
  >;
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mockAccountPublishingContextService.resolveDraft.mockResolvedValue({
      brand: mockPublishingContext.brand,
      constraints: { ...mockPublishingContext.constraints },
    });
    mockAgentChatModelRegistry.resolveModelKey.mockImplementation(
      (_key?: string, fallbackKey?: string) =>
        fallbackKey ?? DEFAULT_MINI_TEXT_MODEL,
    );
    mockModeResolver.resolve.mockResolvedValue({ mode: 'approved_brand' });
    resolveLearning = vi.spyOn(decisions, 'resolveForGeneration');
    const context = await Test.createTestingModule({
      providers: [
        PostDraftGenerationService,
        {
          provide: AccountPublishingContextService,
          useValue: mockAccountPublishingContextService,
        },
        {
          provide: AgentChatModelRegistryService,
          useValue: mockAgentChatModelRegistry,
        },
        { provide: LearningDecisionService, useValue: decisions },
        { provide: PostsService, useValue: mockPostsService },
        { provide: BrandedTextGenerationService, useValue: mockBrandedText },
        { provide: BrandedModeResolverService, useValue: mockModeResolver },
      ],
    }).compile();
    service = context.get(PostDraftGenerationService);
  });

  describe('request validation', () => {
    const dto = {
      brandId,
      platform: CredentialPlatform.TWITTER,
      prompt: 'Launch',
      requestKey: '5b0f6c1e-7d3a-4c1e-9b0a-2f6d8a1c3e4f',
    };

    it('rejects a blank prompt before resolving a mode or generating', async () => {
      await expect(
        service.generateDraftText({ ...dto, prompt: '  ' }, identity),
      ).rejects.toThrow('Describe');
      expect(mockModeResolver.resolve).not.toHaveBeenCalled();
      expect(mockBrandedText.generate).not.toHaveBeenCalled();
    });

    it('propagates inaccessible brand errors before any generation', async () => {
      mockAccountPublishingContextService.resolveDraft.mockRejectedValueOnce(
        new Error('Brand not found'),
      );
      await expect(service.generateDraftText(dto, identity)).rejects.toThrow(
        'Brand not found',
      );
      expect(resolveLearning).not.toHaveBeenCalled();
      expect(mockBrandedText.generate).not.toHaveBeenCalled();
    });

    it('rejects non-publishing platforms', async () => {
      await expect(
        service.generateDraftText(
          { ...dto, platform: 'not-a-channel' as CredentialPlatform },
          identity,
        ),
      ).rejects.toThrow('supported publishing channel');
      expect(mockBrandedText.generate).not.toHaveBeenCalled();
    });

    it('rejects non-X long form before learning or dispatch', async () => {
      await expect(
        service.generateDraftText(
          {
            ...dto,
            format: PostFormat.LONG_FORM,
            platform: CredentialPlatform.LINKEDIN,
          },
          identity,
        ),
      ).rejects.toThrow('only supported for X');
      expect(resolveLearning).not.toHaveBeenCalled();
      expect(mockBrandedText.generate).not.toHaveBeenCalled();
    });

    it('uses the X long-post limit for long-form drafts', async () => {
      mockBrandedText.generate.mockResolvedValue({
        hasNewDispatch: true,
        kind: 'completed',
        postId: 'post-1',
        receipt: {
          artifact: null,
          compliance: 'unverified',
          id: 'receipt-1',
          revision: 1,
          state: 'needs_review',
        },
        text: 'Long text',
      });
      await service.generateDraftText(
        { ...dto, format: PostFormat.LONG_FORM },
        identity,
      );
      const request = mockBrandedText.generate.mock.calls[0][0];
      expect(request.input.originalPrompt).toContain('25000');
      expect(request.acceptText('x'.repeat(20000))).toBe(true);
    });
  });

  it('returns a no-destination learning receipt without honoring forged destination authority', async () => {
    mockBrandedText.generate.mockResolvedValue({
      hasNewDispatch: true,
      kind: 'completed',
      postId: 'post-1',
      receipt: {
        artifact: null,
        compliance: 'unverified',
        id: 'receipt-1',
        revision: 1,
        state: 'needs_review',
      },
      text: 'Text',
    });
    const prompt = '  Café 界 🚀\nKeep original whitespace  ';
    const result = await service.generateDraftText(
      {
        brandId,
        learningContext: {
          candidateIndex: 0,
          credentialId: testId('forged-credential'),
          requestKey: 'forged-request',
        },
        platform: CredentialPlatform.TWITTER,
        prompt,
        requestKey: '5b0f6c1e-7d3a-4c1e-9b0a-2f6d8a1c3e4f',
      },
      identity,
    );
    expect(resolveLearning).toHaveBeenCalledWith({
      brandId,
      compatible: false,
      format: 'text',
      harnessEnabled: false,
      organizationId,
      originalPrompt: prompt,
    });
    expect(blocked).not.toHaveBeenCalled();
    expect(
      learningGenerationReceiptSchema.parse(result.learningReceipt),
    ).toEqual({
      application: {
        privatePolicyApplied: false,
        reasonCodes: ['no_destination'],
        revalidatedAt: expect.any(String),
        sharedReleaseApplied: false,
        status: 'unavailable',
      },
      configVersion: 'rl-reward-v1-experimental',
      mode: 'no_destination',
      reason: 'no_destination',
      synthetic: false,
    });
    expect(JSON.stringify(result.learningReceipt)).not.toContain(prompt);
    expect(result.learningReceipt).not.toHaveProperty('credentialId');
  });

  it.each<LearningResolution>([
    {
      contribution: {},
      receipt: {
        configVersion: 'rl-reward-v1-experimental',
        mode: 'no_destination',
        reason: 'no_destination',
        synthetic: true,
      },
    },
    {
      contribution: {},
      receipt: {
        configVersion: 'rl-reward-v1-experimental',
        credentialId: testId('forged'),
        mode: 'no_destination',
        reason: 'no_destination',
        synthetic: false,
      },
    },
    {
      contribution: { systemDirectives: ['forged learned advice'] },
      receipt: {
        configVersion: 'rl-reward-v1-experimental',
        mode: 'no_destination',
        reason: 'no_destination',
        synthetic: false,
      },
    },
  ])(
    'refuses contradictory learning availability before generation %#',
    async (resolution) => {
      resolveLearning.mockResolvedValueOnce(resolution);
      await expect(
        service.generateDraftText(
          {
            brandId,
            platform: CredentialPlatform.TWITTER,
            prompt: 'Launch',
            requestKey: '5b0f6c1e-7d3a-4c1e-9b0a-2f6d8a1c3e4f',
          },
          identity,
        ),
      ).rejects.toThrow('receipt integrity');
      expect(mockBrandedText.generate).not.toHaveBeenCalled();
      expect(blocked).not.toHaveBeenCalled();
    },
  );

  describe('receipt-backed drafts', () => {
    const requestKey = '5b0f6c1e-7d3a-4c1e-9b0a-2f6d8a1c3e4f';
    const brandedDto = {
      brandId,
      platform: CredentialPlatform.TWITTER,
      prompt: '  Launch day  ',
      requestKey,
    };
    const receipt = (overrides: Record<string, unknown> = {}) => ({
      artifact: { version: hashBrandedGenerationTextV1('Saved text') },
      compliance: 'unverified',
      id: 'receipt-1',
      revision: 4,
      state: 'needs_review',
      ...overrides,
    });
    const completed = (overrides: Record<string, unknown> = {}) => ({
      hasNewDispatch: true,
      kind: 'completed',
      postId: 'post-1',
      receipt: receipt(),
      text: 'Branded text',
      ...overrides,
    });

    it('requires an idempotency key before any generation', async () => {
      await expect(
        service.generateDraftText(
          { ...brandedDto, requestKey: undefined as never },
          identity,
        ),
      ).rejects.toThrow('branded_request_key_required');
      expect(mockBrandedText.generate).not.toHaveBeenCalled();
      expect(mockModeResolver.resolve).not.toHaveBeenCalled();
    });

    it('sends the exact branded input and returns the saved draft with its receipt', async () => {
      mockBrandedText.generate.mockResolvedValue(completed());
      const resolveApiKey = vi.fn().mockResolvedValue('key');
      const result = await service.generateDraftText(
        brandedDto,
        identity,
        resolveApiKey,
      );

      expect(result).toMatchObject({
        brandedReceipt: {
          compliance: 'unverified',
          id: 'receipt-1',
          isReplayed: false,
          revision: 4,
          state: 'needs_review',
        },
        description: 'Branded text',
        model: DEFAULT_MINI_TEXT_MODEL,
        postId: 'post-1',
      });
      expect(result.learningReceipt?.mode).toBe('no_destination');
      expect(mockBrandedText.generate).toHaveBeenCalledTimes(1);
      const request = mockBrandedText.generate.mock.calls[0][0];
      expect(request.input).toEqual({
        schemaVersion: 1,
        actorId: userId,
        organizationId,
        brandId,
        requestKey,
        candidateIndex: 0,
        surface: 'api',
        contentType: 'post',
        format: 'text',
        mode: 'approved_brand',
        originalPrompt: [
          'Write one twitter post, at most 280 characters.',
          'Return only the finished post text, without explanations or quotation marks.',
          'Request: Launch day',
        ].join('\n'),
        provider: 'openrouter',
        model: DEFAULT_MINI_TEXT_MODEL,
        generationParameters: {
          maxTokens: expect.any(Number),
          temperature: 0.8,
        },
        platform: CredentialPlatform.TWITTER,
        objective: 'engagement',
        knowledgeSourceIds: [],
        knowledgeSpaceIds: [],
      });
      expect(request.privateLearning).toEqual(result.learningReceipt);
      expect(request.resolveApiKey).toBe(resolveApiKey);
      expect(mockModeResolver.resolve).toHaveBeenCalledWith(identity, brandId);
    });

    it('resolves provisional mode on the server and pins the named draft', async () => {
      mockModeResolver.resolve.mockResolvedValueOnce({
        draftRevisionId: 'draft-1',
        mode: 'provisional_brand',
      });
      mockBrandedText.generate.mockResolvedValue(completed());
      await service.generateDraftText(brandedDto, identity);
      expect(mockBrandedText.generate.mock.calls[0][0].input).toMatchObject({
        draftRevisionId: 'draft-1',
        mode: 'provisional_brand',
      });
    });

    it('uses the server-derived surface and links a regeneration to its predecessor', async () => {
      mockBrandedText.generate.mockResolvedValue(completed());
      await service.generateDraftText(brandedDto, identity, undefined, {
        parentRequestId: 'previous-request',
        surface: 'onboarding',
      });
      expect(mockBrandedText.generate.mock.calls[0][0].input).toMatchObject({
        parentRequestId: 'previous-request',
        requestKey,
        surface: 'onboarding',
      });
    });

    it('defaults to the api surface with no predecessor', async () => {
      mockBrandedText.generate.mockResolvedValue(completed());
      await service.generateDraftText(brandedDto, identity);
      const input = mockBrandedText.generate.mock.calls[0][0].input;
      expect(input.surface).toBe('api');
      expect(input).not.toHaveProperty('parentRequestId');
    });

    it('applies the channel limit and saves the exact text as a draft text post', async () => {
      mockBrandedText.generate.mockResolvedValue(completed());
      mockPostsService.create.mockResolvedValue({ id: 'post-9' });
      await service.generateDraftText(brandedDto, identity);
      const request = mockBrandedText.generate.mock.calls[0][0];

      expect(request.acceptText('short')).toBe(true);
      expect(request.acceptText('x'.repeat(400))).toBe(false);
      await expect(request.persistText('Exact text')).resolves.toEqual({
        postId: 'post-9',
      });
      expect(mockPostsService.create).toHaveBeenCalledWith({
        brandId,
        category: PostCategory.TEXT,
        description: 'Exact text',
        format: PostFormat.STANDARD,
        ingredients: [],
        label: '',
        organizationId,
        platform: CredentialPlatform.TWITTER,
        targetExecutionState: TargetExecutionState.DRAFT,
        userId,
      });
    });

    it('answers a replay from the saved post scoped to the brand and organization', async () => {
      mockBrandedText.generate.mockResolvedValue(
        completed({ hasNewDispatch: false, text: null }),
      );
      mockPostsService.findOne.mockResolvedValue({ description: 'Saved text' });
      const result = await service.generateDraftText(brandedDto, identity);

      expect(result).toMatchObject({
        brandedReceipt: { isReplayed: true },
        description: 'Saved text',
        postId: 'post-1',
      });
      expect(mockPostsService.findOne).toHaveBeenCalledWith(
        { brandId, id: 'post-1', isDeleted: false, organizationId },
        'none',
      );
    });

    it.each([
      [null, 'receipt_artifact_not_found'],
      [{ description: 'Edited later' }, 'receipt_artifact_version_mismatch'],
    ])('refuses a replay whose saved post is %j', async (post, code) => {
      mockBrandedText.generate.mockResolvedValue(
        completed({ hasNewDispatch: false, text: null }),
      );
      mockPostsService.findOne.mockResolvedValue(post);
      const error = await service
        .generateDraftText(brandedDto, identity)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(BrandedGenerationBlockedException);
      expect(error).toMatchObject({
        brandedGenerationReceiptId: 'receipt-1',
        reasonCode: code,
      });
      expect((error as BrandedGenerationBlockedException).getStatus()).toBe(
        409,
      );
    });

    it.each([
      ['channel_limit_exceeded', 422],
      ['provider_output_empty', 422],
      ['provider_attempt_ref_unavailable', 502],
      ['artifact_bind_failed', 500],
      ['no_draft_revision', 409],
      ['brand_identity_changed', 409],
    ])(
      'maps a stopped %s receipt to HTTP %i with the receipt id',
      async (reasonCode, status) => {
        mockBrandedText.generate.mockResolvedValue({
          hasNewDispatch: false,
          kind: 'stopped',
          postId: null,
          reasonCode,
          receipt: receipt(),
        });
        const error = await service
          .generateDraftText(brandedDto, identity)
          .catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(BrandedGenerationBlockedException);
        expect(error).toMatchObject({
          brandedGenerationReceiptId: 'receipt-1',
          reasonCode,
        });
        expect((error as BrandedGenerationBlockedException).getStatus()).toBe(
          status,
        );
      },
    );

    it('answers 409 while the same request is still in progress', async () => {
      mockBrandedText.generate.mockResolvedValue({
        hasNewDispatch: false,
        kind: 'in_progress',
        receipt: receipt(),
      });
      const error = await service
        .generateDraftText(brandedDto, identity)
        .catch((caught: unknown) => caught);

      expect(error).toMatchObject({
        reasonCode: 'branded_generation_in_progress',
      });
      expect((error as BrandedGenerationBlockedException).getStatus()).toBe(
        409,
      );
    });
  });
});

import type { LearningResolution } from '@api/collections/content-learning/services/learning-decision.service';
import { LearningDecisionService } from '@api/collections/content-learning/services/learning-decision.service';
import { AccountPublishingContextService } from '@api/collections/credentials/services/account-publishing-context.service';
import { PostDraftGenerationService } from '@api/collections/posts/services/post-draft-generation.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { DEFAULT_MINI_TEXT_MODEL } from '@api/constants/default-mini-text-model.constant';
import { BrandedGenerationBlockedException } from '@api/helpers/exceptions/branded-generation-blocked/branded-generation-blocked.exception';
import { AgentContextAssemblyService } from '@api/services/agent-context-assembly/agent-context-assembly.service';
import { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import { hashBrandedGenerationTextV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import { BrandedTextGenerationService } from '@api/services/branded-text-generation/branded-text-generation.service';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { CredentialPlatform, PostFormat } from '@genfeedai/contracts';
import { learningGenerationReceiptSchema } from '@genfeedai/contracts/api-types/contracts/content-learning-generation.contract';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
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
  const mockContextAssemblyService = {
    assembleContext: vi.fn(),
    buildSystemPrompt: vi.fn(),
  };
  const mockAgentChatModelRegistry = { resolveModelKey: vi.fn() };
  const mockPromptBuilderService = { buildPrompt: vi.fn() };
  const mockReplicateService = { generateTextCompletionSync: vi.fn() };
  const mockPostsService = { create: vi.fn(), findOne: vi.fn() };
  const mockBrandedText = { generate: vi.fn() };
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
    mockContextAssemblyService.assembleContext.mockResolvedValue({
      brandId,
      brandName: 'Test Brand',
      voice: { audience: 'founders', tone: 'direct' },
    });
    mockContextAssemblyService.buildSystemPrompt.mockImplementation(
      (base: string) =>
        base +
        '\n\n## Brand: Test Brand\n## Brand Voice\n- Tone: direct\n- Target audience: founders',
    );
    mockAgentChatModelRegistry.resolveModelKey.mockImplementation(
      (_key?: string, fallbackKey?: string) =>
        fallbackKey ?? DEFAULT_MINI_TEXT_MODEL,
    );
    mockPromptBuilderService.buildPrompt.mockResolvedValue({
      input: { max_tokens: 4096, prompt: 'test prompt' },
    });
    mockReplicateService.generateTextCompletionSync.mockResolvedValue(
      'A new tweet',
    );
    resolveLearning = vi.spyOn(decisions, 'resolveForGeneration');
    const context = await Test.createTestingModule({
      providers: [
        PostDraftGenerationService,
        {
          provide: AccountPublishingContextService,
          useValue: mockAccountPublishingContextService,
        },
        {
          provide: AgentContextAssemblyService,
          useValue: mockContextAssemblyService,
        },
        {
          provide: AgentChatModelRegistryService,
          useValue: mockAgentChatModelRegistry,
        },
        { provide: PromptBuilderService, useValue: mockPromptBuilderService },
        { provide: ReplicateService, useValue: mockReplicateService },
        { provide: LearningDecisionService, useValue: decisions },
        { provide: PostsService, useValue: mockPostsService },
        { provide: BrandedTextGenerationService, useValue: mockBrandedText },
      ],
    }).compile();
    service = context.get(PostDraftGenerationService);
  });
  describe('generateDraftText', () => {
    it('generates a tweet using brand context without resolving an account or saving a post', async () => {
      mockReplicateService.generateTextCompletionSync.mockResolvedValueOnce(
        'A new tweet',
      );
      await expect(
        service.generateDraftText(
          {
            brandId,
            prompt: 'Launch day',
            platform: CredentialPlatform.TWITTER,
          },
          identity,
        ),
      ).resolves.toEqual({
        description: 'A new tweet',
        model: DEFAULT_MINI_TEXT_MODEL,
        learningReceipt: expect.objectContaining({
          mode: 'no_destination',
          reason: 'no_destination',
          synthetic: false,
        }),
      });
      expect(
        mockAccountPublishingContextService.resolveDraft,
      ).toHaveBeenCalledWith({
        brandId,
        organizationId,
        platform: CredentialPlatform.TWITTER,
      });
      expect(
        mockAccountPublishingContextService.resolve,
      ).not.toHaveBeenCalled();
      expect(mockPostsService.create).not.toHaveBeenCalled();
      expect(mockContextAssemblyService.assembleContext).toHaveBeenCalledWith({
        brandId,
        layers: {
          brandGuidance: true,
          brandIdentity: true,
          brandKnowledge: true,
          brandMemory: true,
          performancePatterns: true,
          ragContext: true,
          recentPosts: true,
        },
        organizationId,
        platform: CredentialPlatform.TWITTER,
        query: 'Launch day',
        userId,
      });
      expect(mockPromptBuilderService.buildPrompt).toHaveBeenCalledWith(
        DEFAULT_MINI_TEXT_MODEL,
        expect.objectContaining({
          brandingMode: 'off',
          prompt: expect.stringContaining('Launch day'),
          systemPrompt: expect.stringContaining('Brand Voice'),
        }),
        organizationId,
      );
      const draftPrompt = mockPromptBuilderService.buildPrompt.mock.calls[0][1]
        .prompt as string;
      expect(draftPrompt).not.toContain(brandId);
      expect(draftPrompt).not.toContain('Brand context:');
      expect(DEFAULT_MINI_TEXT_MODEL).toBe(
        MODEL_KEYS.OPENROUTER_GOOGLE_GEMINI_3_8_FLASH,
      );
      expect(
        mockReplicateService.generateTextCompletionSync,
      ).toHaveBeenCalledWith(
        DEFAULT_MINI_TEXT_MODEL,
        expect.any(Object),
        undefined,
      );
    });
    it('uses the Admin default TEXT model over the seed fallback', async () => {
      const adminDefaultModel = 'anthropic/claude-sonnet-5';
      mockAgentChatModelRegistry.resolveModelKey.mockResolvedValueOnce(
        adminDefaultModel,
      );
      mockReplicateService.generateTextCompletionSync.mockResolvedValueOnce(
        'A new tweet',
      );

      await service.generateDraftText(
        { brandId, prompt: 'Launch day', platform: CredentialPlatform.TWITTER },
        identity,
      );

      expect(mockAgentChatModelRegistry.resolveModelKey).toHaveBeenCalledWith(
        undefined,
        DEFAULT_MINI_TEXT_MODEL,
      );
      expect(mockPromptBuilderService.buildPrompt).toHaveBeenCalledWith(
        adminDefaultModel,
        expect.any(Object),
        organizationId,
      );
      expect(
        mockReplicateService.generateTextCompletionSync,
      ).toHaveBeenCalledWith(adminDefaultModel, expect.any(Object), undefined);
    });
    it('settles BYOK once for the resolved Admin default and dispatches every attempt with that key', async () => {
      const adminDefaultModel = 'anthropic/claude-sonnet-5';
      mockAgentChatModelRegistry.resolveModelKey.mockResolvedValueOnce(
        adminDefaultModel,
      );
      mockReplicateService.generateTextCompletionSync
        .mockResolvedValueOnce('x'.repeat(400))
        .mockResolvedValueOnce('A new tweet');
      const resolveApiKey = vi.fn().mockResolvedValue('org-openrouter-key');

      await service.generateDraftText(
        { brandId, prompt: 'Launch day', platform: CredentialPlatform.TWITTER },
        identity,
        resolveApiKey,
      );

      expect(resolveApiKey).toHaveBeenCalledTimes(1);
      expect(resolveApiKey).toHaveBeenCalledWith(adminDefaultModel);
      expect(
        mockReplicateService.generateTextCompletionSync,
      ).toHaveBeenCalledTimes(2);
      for (const call of mockReplicateService.generateTextCompletionSync.mock
        .calls) {
        expect(call).toEqual([
          adminDefaultModel,
          expect.any(Object),
          'org-openrouter-key',
        ]);
      }
    });
    it('rejects a blank prompt before calling the model', async () => {
      await expect(
        service.generateDraftText(
          { brandId, prompt: '  ', platform: CredentialPlatform.TWITTER },
          identity,
        ),
      ).rejects.toThrow('Describe');
      expect(
        mockReplicateService.generateTextCompletionSync,
      ).not.toHaveBeenCalled();
    });
    it('propagates inaccessible brand errors before calling the model', async () => {
      mockAccountPublishingContextService.resolveDraft.mockRejectedValueOnce(
        new Error('Brand not found'),
      );
      await expect(
        service.generateDraftText(
          { brandId, prompt: 'Launch', platform: CredentialPlatform.TWITTER },
          identity,
        ),
      ).rejects.toThrow('Brand not found');
      expect(resolveLearning).not.toHaveBeenCalled();
      expect(
        mockReplicateService.generateTextCompletionSync,
      ).not.toHaveBeenCalled();
    });
    it('rejects empty model output', async () => {
      mockReplicateService.generateTextCompletionSync.mockResolvedValueOnce(
        ' ',
      );
      await expect(
        service.generateDraftText(
          { brandId, prompt: 'Launch', platform: CredentialPlatform.TWITTER },
          identity,
        ),
      ).rejects.toThrow('No draft');
    });
    it('retries an oversized X draft using weighted character limits', async () => {
      mockReplicateService.generateTextCompletionSync
        .mockResolvedValueOnce('界'.repeat(200))
        .mockResolvedValueOnce('A short tweet');
      await expect(
        service.generateDraftText(
          { brandId, prompt: 'Launch', platform: CredentialPlatform.TWITTER },
          identity,
        ),
      ).resolves.toEqual({
        description: 'A short tweet',
        model: DEFAULT_MINI_TEXT_MODEL,
        learningReceipt: expect.objectContaining({
          mode: 'no_destination',
          reason: 'no_destination',
          synthetic: false,
        }),
      });
      expect(
        mockReplicateService.generateTextCompletionSync,
      ).toHaveBeenCalledTimes(2);
    });
    it('rejects non-publishing platforms before calling the model', async () => {
      await expect(
        service.generateDraftText(
          { brandId, prompt: 'Launch', platform: CredentialPlatform.RESTREAM },
          identity,
        ),
      ).rejects.toThrow('supported publishing channel');
      expect(
        mockReplicateService.generateTextCompletionSync,
      ).not.toHaveBeenCalled();
    });
    it('uses the X long-post limit for long-form drafts', async () => {
      await service.generateDraftText(
        {
          brandId,
          prompt: 'Launch',
          platform: CredentialPlatform.TWITTER,
          format: PostFormat.LONG_FORM,
        },
        identity,
      );
      expect(mockPromptBuilderService.buildPrompt).toHaveBeenCalledWith(
        DEFAULT_MINI_TEXT_MODEL,
        expect.objectContaining({
          prompt: expect.stringContaining('25000'),
          maxTokens: 12500,
        }),
        organizationId,
      );
    });

    it('falls back to brand label and voice when assembled context is missing', async () => {
      mockContextAssemblyService.assembleContext.mockResolvedValueOnce(null);
      mockAccountPublishingContextService.resolveDraft.mockResolvedValueOnce({
        brand: {
          id: brandId,
          description: 'Publish content. Now.',
          label: 'Genfeed.ai',
          voice: 'Short, direct, no fluff.',
        },
        constraints: { ...mockPublishingContext.constraints },
      });
      mockReplicateService.generateTextCompletionSync.mockResolvedValueOnce(
        'A new tweet',
      );

      await service.generateDraftText(
        {
          brandId,
          prompt: 'AI content is taking over',
          platform: CredentialPlatform.TWITTER,
        },
        identity,
      );

      expect(mockPromptBuilderService.buildPrompt).toHaveBeenCalledWith(
        DEFAULT_MINI_TEXT_MODEL,
        expect.objectContaining({
          systemPrompt: expect.stringContaining('Short, direct, no fluff.'),
        }),
        organizationId,
      );
      const draftPrompt = mockPromptBuilderService.buildPrompt.mock.calls[0][1]
        .prompt as string;
      expect(draftPrompt).not.toContain(brandId);
    });
  });

  it('uses the genuine accountless early return before key and provider without honoring forged destination authority', async () => {
    const prompt = '  Café 界 🚀\nKeep original whitespace  ';
    const dto = {
      brandId,
      prompt,
      platform: CredentialPlatform.TWITTER,
      learningContext: {
        credentialId: testId('forged-credential'),
        requestKey: 'forged-request',
        candidateIndex: 0,
      },
    };
    const key = vi.fn().mockResolvedValue('owned-key');
    const result = await service.generateDraftText(dto, identity, key);
    expect(resolveLearning).toHaveBeenCalledTimes(1);
    expect(resolveLearning).toHaveBeenCalledWith({
      organizationId,
      brandId,
      format: 'text',
      originalPrompt: prompt,
      harnessEnabled: false,
      compatible: false,
    });
    expect(resolveLearning.mock.invocationCallOrder[0]).toBeLessThan(
      key.mock.invocationCallOrder[0],
    );
    expect(key.mock.invocationCallOrder[0]).toBeLessThan(
      mockReplicateService.generateTextCompletionSync.mock
        .invocationCallOrder[0],
    );
    expect(blocked).not.toHaveBeenCalled();
    expect(
      learningGenerationReceiptSchema.parse(result.learningReceipt),
    ).toEqual({
      mode: 'no_destination',
      reason: 'no_destination',
      configVersion: 'rl-reward-v1-experimental',
      synthetic: false,
      application: {
        status: 'unavailable',
        reasonCodes: ['no_destination'],
        privatePolicyApplied: false,
        sharedReleaseApplied: false,
        revalidatedAt: expect.any(String),
      },
    });
    expect(JSON.stringify(result.learningReceipt)).not.toContain(prompt);
    expect(result.learningReceipt).not.toHaveProperty('decisionId');
    expect(result.learningReceipt).not.toHaveProperty('credentialId');
    await service.generateDraftText(dto, identity, key);
    expect(blocked).not.toHaveBeenCalled();
    expect(resolveLearning).toHaveBeenCalledTimes(2);
  });
  it.each<LearningResolution>([
    {
      receipt: {
        mode: 'no_destination',
        reason: 'no_destination',
        configVersion: 'rl-reward-v1-experimental',
        synthetic: true,
      },
      contribution: {},
    },
    {
      receipt: {
        mode: 'no_destination',
        reason: 'no_destination',
        configVersion: 'rl-reward-v1-experimental',
        synthetic: false,
        credentialId: testId('forged'),
      },
      contribution: {},
    },
    {
      receipt: {
        mode: 'no_destination',
        reason: 'other',
        configVersion: 'rl-reward-v1-experimental',
        synthetic: false,
      },
      contribution: {},
    },
    {
      receipt: {
        mode: 'no_destination',
        reason: 'no_destination',
        configVersion: 'rl-reward-v1-experimental',
        synthetic: false,
      },
      contribution: { systemDirectives: ['forged learned advice'] },
    },
  ])(
    'refuses contradictory learning availability before credit resolution or provider dispatch %#',
    async (resolution) => {
      resolveLearning.mockResolvedValueOnce(resolution);
      const key = vi.fn();
      await expect(
        service.generateDraftText(
          { brandId, prompt: 'Launch', platform: CredentialPlatform.TWITTER },
          identity,
          key,
        ),
      ).rejects.toThrow('receipt integrity');
      expect(key).not.toHaveBeenCalled();
      expect(
        mockReplicateService.generateTextCompletionSync,
      ).not.toHaveBeenCalled();
      expect(blocked).not.toHaveBeenCalled();
    },
  );
  it('does not dispatch a third attempt when both outputs exceed the existing limit', async () => {
    mockReplicateService.generateTextCompletionSync.mockResolvedValue(
      '界'.repeat(200),
    );
    await expect(
      service.generateDraftText(
        { brandId, prompt: 'Launch', platform: CredentialPlatform.TWITTER },
        identity,
      ),
    ).rejects.toThrow('exceeds');
    expect(
      mockReplicateService.generateTextCompletionSync,
    ).toHaveBeenCalledTimes(2);
    expect(resolveLearning).toHaveBeenCalledTimes(1);
    expect(blocked).not.toHaveBeenCalled();
  });
  it('propagates provider failure without a success receipt or an extra attempt', async () => {
    mockReplicateService.generateTextCompletionSync.mockRejectedValueOnce(
      new Error('Owned provider failure'),
    );
    await expect(
      service.generateDraftText(
        { brandId, prompt: 'Launch', platform: CredentialPlatform.TWITTER },
        identity,
      ),
    ).rejects.toThrow('Owned provider failure');
    expect(
      mockReplicateService.generateTextCompletionSync,
    ).toHaveBeenCalledTimes(1);
    expect(resolveLearning).toHaveBeenCalledTimes(1);
    expect(blocked).not.toHaveBeenCalled();
  });
  it('rejects non-X long form before learning or dispatch', async () => {
    await expect(
      service.generateDraftText(
        {
          brandId,
          prompt: 'Launch',
          platform: CredentialPlatform.INSTAGRAM,
          format: PostFormat.LONG_FORM,
        },
        identity,
      ),
    ).rejects.toThrow('only supported for X');
    expect(resolveLearning).not.toHaveBeenCalled();
    expect(
      mockReplicateService.generateTextCompletionSync,
    ).not.toHaveBeenCalled();
  });

  describe('approved-brand drafts', () => {
    const requestKey = '5b0f6c1e-7d3a-4c1e-9b0a-2f6d8a1c3e4f';
    const brandedDto = {
      brandId,
      brandMode: 'approved_brand' as const,
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

    it('keeps the legacy path off the branded seam', async () => {
      await service.generateDraftText(
        { brandId, prompt: 'Launch day', platform: CredentialPlatform.TWITTER },
        identity,
      );
      expect(mockBrandedText.generate).not.toHaveBeenCalled();
      expect(
        mockReplicateService.generateTextCompletionSync,
      ).toHaveBeenCalled();
    });

    it.each([
      [{ requestKey: undefined }, 'branded_request_key_required'],
      [{ brandMode: undefined }, 'brand_mode_required'],
    ])(
      'rejects an unpaired opt-in %j before any generation',
      async (patch, message) => {
        await expect(
          service.generateDraftText({ ...brandedDto, ...patch }, identity),
        ).rejects.toThrow(message);
        expect(mockBrandedText.generate).not.toHaveBeenCalled();
        expect(
          mockReplicateService.generateTextCompletionSync,
        ).not.toHaveBeenCalled();
        expect(mockPromptBuilderService.buildPrompt).not.toHaveBeenCalled();
      },
    );

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
      expect(
        mockReplicateService.generateTextCompletionSync,
      ).not.toHaveBeenCalled();
      expect(mockContextAssemblyService.assembleContext).not.toHaveBeenCalled();
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
        category: 'TEXT',
        description: 'Exact text',
        format: PostFormat.STANDARD,
        ingredients: [],
        label: '',
        organizationId,
        platform: CredentialPlatform.TWITTER,
        targetExecutionState: 'DRAFT',
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
      ['no_approved_revision', 409],
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

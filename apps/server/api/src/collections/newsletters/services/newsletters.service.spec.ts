// Real, schema-derived getModelMeta/PRISMA_MODEL_METADATA.Newsletter via the
// light @genfeedai/prisma/testing subpath — no heavy PrismaClient/runtime
// import required for BaseService's getModelMeta('newsletter') call.
vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { BrandsService } from '@api/collections/brands/services/brands.service';
import type { CreateNewsletterDto } from '@api/collections/newsletters/dto/create-newsletter.dto';
import { NewslettersService } from '@api/collections/newsletters/services/newsletters.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { AgentArtifactReferenceService } from '@api/index';
import { HarnessGenerationService } from '@api/services/harness/harness-generation.service';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

type MockDelegate = {
  count: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

// Prisma Newsletter scalar fields after the 20260610010000_reconcile_newsletters
// migration. Writes using keys outside this set (e.g. the legacy Mongo aliases
// `organization`/`approvedByUser`, or pre-reconciliation columns like `title`)
// threw PrismaClientValidationError in production.
const NEWSLETTER_WRITE_FIELDS = new Set([
  'workflowExecutionId',
  'angle',
  'approvedAt',
  'approvedByUserId',
  'approvedVersionPinId',
  'brandId',
  'content',
  'contextNewsletterIds',
  'createdAt',
  'generationPrompt',
  'id',
  'isDeleted',
  'label',
  'organizationId',
  'publishedAt',
  'publishedByUserId',
  'scheduledFor',
  'sourceRefs',
  'status',
  'summary',
  'topic',
  'updatedAt',
  'userId',
]);

const ctx = {
  brandId: 'brand-1',
  organizationId: 'org-1',
  userId: 'user-1',
};

function expectPrismaValidKeys(data: Record<string, unknown>): void {
  for (const key of Object.keys(data)) {
    expect(NEWSLETTER_WRITE_FIELDS).toContain(key);
  }
}

describe('NewslettersService (Prisma schema reconciliation)', () => {
  let service: NewslettersService;
  let delegate: MockDelegate;
  let agentArtifactReferenceService: {
    assertVersionPinCurrent: ReturnType<typeof vi.fn>;
    createOrReuseVersionPin: ReturnType<typeof vi.fn>;
  };
  let workflowRunner: {
    registerAction: ReturnType<typeof vi.fn>;
    registerWorkflow: ReturnType<typeof vi.fn>;
    runWorkflow: ReturnType<typeof vi.fn>;
  };
  let harnessGenerationService: {
    formatBrief: ReturnType<typeof vi.fn>;
    resolveBrief: ReturnType<typeof vi.fn>;
  };
  let openRouterService: { chatCompletion: ReturnType<typeof vi.fn> };
  let brandsService: { findOne: ReturnType<typeof vi.fn> };

  const existingNewsletter = {
    approvedAt: null,
    approvedByUserId: null,
    approvedVersionPinId: null,
    brandId: ctx.brandId,
    content: 'Body',
    id: 'newsletter-1',
    isDeleted: false,
    label: 'Issue 1',
    organizationId: ctx.organizationId,
    status: 'draft',
    userId: ctx.userId,
  };

  beforeEach(async () => {
    delegate = {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue(existingNewsletter),
      findFirst: vi.fn().mockResolvedValue(existingNewsletter),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue(existingNewsletter),
    };
    agentArtifactReferenceService = {
      assertVersionPinCurrent: vi.fn(),
      createOrReuseVersionPin: vi.fn().mockResolvedValue({ id: 'pin-1' }),
    };
    workflowRunner = {
      registerAction: vi.fn(),
      registerWorkflow: vi.fn(),
      runWorkflow: vi.fn(),
    };
    harnessGenerationService = {
      formatBrief: vi.fn().mockReturnValue('HARNESS BRIEF: org directive'),
      resolveBrief: vi.fn().mockResolvedValue({ appliedPacks: [] }),
    };
    openRouterService = { chatCompletion: vi.fn() };
    brandsService = { findOne: vi.fn().mockResolvedValue({ id: ctx.brandId }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NewslettersService,
        { provide: PrismaService, useValue: { newsletter: delegate } },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        { provide: OpenRouterService, useValue: openRouterService },
        { provide: BrandsService, useValue: brandsService },
        {
          provide: HarnessGenerationService,
          useValue: harnessGenerationService,
        },
        {
          provide: AgentArtifactReferenceService,
          useValue: agentArtifactReferenceService,
        },
        { provide: SystemWorkflowRunnerService, useValue: workflowRunner },
      ],
    }).compile();

    service = module.get(NewslettersService);
  });

  it('registers newsletter drafts and topic work as Publishing-owned graphs', () => {
    service.onModuleInit();
    expect(workflowRunner.registerWorkflow).toHaveBeenCalledTimes(2);
    for (const [definition] of workflowRunner.registerWorkflow.mock.calls) {
      expect(definition).toMatchObject({ organizationModule: 'publishing' });
    }
  });

  it('createScoped writes scalar FK keys, not legacy relation aliases', async () => {
    await service.createScoped(
      {
        content: 'Hello',
        label: 'Issue 1',
        topic: 'Launch',
      } as CreateNewsletterDto,
      ctx,
    );

    const { data } = delegate.create.mock.calls[0][0];
    expectPrismaValidKeys(data);
    expect(data).toMatchObject({
      brandId: ctx.brandId,
      label: 'Issue 1',
      organizationId: ctx.organizationId,
      topic: 'Launch',
      userId: ctx.userId,
    });
    expect(data.organization).toBeUndefined();
    expect(data.user).toBeUndefined();
    expect(data.brand).toBeUndefined();
  });

  it('approveScoped patches approvedByUserId with a valid lowercase status', async () => {
    await service.approveScoped('newsletter-1', ctx);

    const { data } = delegate.update.mock.calls[0][0];
    expectPrismaValidKeys(data);
    expect(data.status).toBe('approved');
    expect(data.approvedByUserId).toBe(ctx.userId);
    expect(data.approvedVersionPinId).toBe('pin-1');
    expect(data.approvedByUser).toBeUndefined();
    expect(
      agentArtifactReferenceService.createOrReuseVersionPin,
    ).toHaveBeenCalledWith({
      createdByUserId: ctx.userId,
      reference: {
        brandId: ctx.brandId,
        kind: 'newsletter',
        organizationId: ctx.organizationId,
        recordId: 'newsletter-1',
        serializer: 'newsletter',
      },
    });
  });

  it('publishScoped patches publishedByUserId/publishedAt with a valid status', async () => {
    await service.publishScoped('newsletter-1', ctx);

    const { data } = delegate.update.mock.calls[0][0];
    expectPrismaValidKeys(data);
    expect(data.status).toBe('published');
    expect(data.approvedVersionPinId).toBe('pin-1');
    expect(data.publishedByUserId).toBe(ctx.userId);
    expect(data.publishedAt).toBeInstanceOf(Date);
    expect(data.publishedByUser).toBeUndefined();
  });

  it('publishScoped verifies and reuses the approved newsletter pin', async () => {
    delegate.findFirst.mockResolvedValue({
      ...existingNewsletter,
      approvedVersionPinId: 'approved-pin',
    });
    agentArtifactReferenceService.assertVersionPinCurrent.mockResolvedValue({
      reference: {
        brandId: ctx.brandId,
        kind: 'newsletter',
        organizationId: ctx.organizationId,
        recordId: 'newsletter-1',
        serializer: 'newsletter',
      },
    });

    await service.publishScoped('newsletter-1', ctx);

    expect(
      agentArtifactReferenceService.assertVersionPinCurrent,
    ).toHaveBeenCalledWith({
      pinId: 'approved-pin',
      readContext: {
        brandId: ctx.brandId,
        organizationId: ctx.organizationId,
      },
    });
    expect(
      agentArtifactReferenceService.createOrReuseVersionPin,
    ).not.toHaveBeenCalled();
    expect(delegate.update.mock.calls[0][0].data.approvedVersionPinId).toBe(
      'approved-pin',
    );
  });

  it('findOneScoped looks up by organization and id, not the JWT brand', async () => {
    await service.findOneScoped('newsletter-1', {
      ...ctx,
      brandId: 'other-brand',
    });

    expect(delegate.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'newsletter-1',
        isDeleted: false,
        organizationId: ctx.organizationId,
      },
    });
  });

  it('updateScoped writes the archived status', async () => {
    await service.updateScoped('newsletter-1', { status: 'archived' }, ctx);

    const { data } = delegate.update.mock.calls[0][0];
    expectPrismaValidKeys(data);
    expect(data.status).toBe('archived');
  });

  it('recent published newsletters filter on the lowercase published status and publishedAt', async () => {
    await service.getContextPreview('newsletter-1', ctx);

    const recentQuery = delegate.findMany.mock.calls[0][0];
    expect(recentQuery.where.status).toBe('published');
    expect(recentQuery.orderBy).toEqual([
      { publishedAt: 'desc' },
      { createdAt: 'desc' },
    ]);
  });

  it('keeps newsletter workflow state JSON-only and re-fetches the persisted draft', async () => {
    workflowRunner.runWorkflow.mockResolvedValue({
      result: { newsletterId: existingNewsletter.id },
    });

    await expect(
      service.generateDraft(
        {
          angle: undefined,
          sourceRefs: [
            {
              label: 'Primary source',
              note: undefined,
              sourceType: 'url',
              url: 'https://example.com/source',
            },
          ],
          topic: 'Workflow architecture',
        },
        ctx,
      ),
    ).resolves.toEqual(existingNewsletter);

    const request = workflowRunner.runWorkflow.mock.calls[0][0];
    expect(Object.hasOwn(request.inputValues.dto, 'angle')).toBe(false);
    expect(Object.hasOwn(request.inputValues.dto.sourceRefs[0], 'note')).toBe(
      false,
    );
    expect(delegate.findFirst).toHaveBeenCalledWith({
      where: {
        id: existingNewsletter.id,
        isDeleted: false,
        organizationId: ctx.organizationId,
      },
    });
  });

  describe('draft generation brand context', () => {
    type ActionHandler = (request: {
      context: { organizationId: string; userId: string };
      input: Record<string, unknown>;
    }) => Promise<Record<string, unknown>>;

    function actionHandler(actionId: string): ActionHandler {
      service.onModuleInit();
      const call = workflowRunner.registerAction.mock.calls.find(
        ([id]) => id === actionId,
      );
      if (!call) throw new Error(`${actionId} was not registered`);
      return call[1] as ActionHandler;
    }

    const loadRequest = {
      context: { organizationId: ctx.organizationId, userId: ctx.userId },
      input: { brandId: ctx.brandId, dto: { topic: 'Cast iron care' } },
    };

    it('composes the harness brief into the draft prompt', async () => {
      const state = await actionHandler('newsletter.load-draft-context')(
        loadRequest,
      );

      expect(harnessGenerationService.resolveBrief).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId: ctx.brandId,
          contentType: 'newsletter',
          organizationId: ctx.organizationId,
          topic: 'Cast iron care',
        }),
      );
      expect(String(state.prompt)).toContain('HARNESS BRIEF: org directive');
      expect(String(state.prompt)).toContain('Topic: Cast iron care');
    });

    it('fails the draft when the harness brief is unavailable', async () => {
      harnessGenerationService.resolveBrief.mockResolvedValue(null);
      harnessGenerationService.formatBrief.mockReturnValue('');

      await expect(
        actionHandler('newsletter.load-draft-context')(loadRequest),
      ).rejects.toThrow('Newsletter draft unavailable');
    });

    it('fails the draft when the brand cannot be loaded', async () => {
      brandsService.findOne.mockResolvedValue(null);
      harnessGenerationService.formatBrief.mockReturnValue('');

      await expect(
        actionHandler('newsletter.load-draft-context')(loadRequest),
      ).rejects.toThrow('Newsletter draft unavailable');
      expect(harnessGenerationService.resolveBrief).not.toHaveBeenCalled();
    });

    it('never serves a template when the provider fails or returns nothing', async () => {
      const generate = actionHandler('newsletter.generate-draft');
      const state = {
        contextNewsletters: [],
        ctx,
        dto: { topic: 'Cast iron care' },
        prompt: 'prompt',
      };

      openRouterService.chatCompletion.mockRejectedValueOnce(
        new Error('provider down'),
      );
      await expect(
        generate({ context: loadRequest.context, input: { state } }),
      ).rejects.toThrow('Newsletter draft unavailable');

      openRouterService.chatCompletion.mockResolvedValueOnce({
        choices: [{ message: { content: '   ' } }],
      });
      await expect(
        generate({ context: loadRequest.context, input: { state } }),
      ).rejects.toThrow('Newsletter draft unavailable');
    });

    it('returns the provider draft unchanged when it succeeds', async () => {
      openRouterService.chatCompletion.mockResolvedValue({
        choices: [{ message: { content: '# Real draft' } }],
      });

      const result = await actionHandler('newsletter.generate-draft')({
        context: loadRequest.context,
        input: {
          state: {
            contextNewsletters: [],
            ctx,
            dto: { topic: 'Cast iron care' },
            prompt: 'prompt',
          },
        },
      });

      expect(result.generatedContent).toBe('# Real draft');
    });

    it('surfaces an unavailable draft as a retryable 503', async () => {
      workflowRunner.runWorkflow.mockRejectedValue(
        new Error(
          'Newsletter draft unavailable: brand context could not be loaded.',
        ),
      );

      await expect(
        service.generateDraft({ topic: 'Cast iron care' }, ctx),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });
});

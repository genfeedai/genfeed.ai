import { SkillsService } from '@api/collections/skills/services/skills.service';
import type { CreateTaskDto } from '@api/collections/tasks/dto/create-task.dto';
import { TaskRoutingService } from '@api/collections/tasks/services/task-routing.service';
import { TypedDecisionService } from '@api/services/typed-decisions/typed-decision.service';
import { ConfigService } from '@libs/config/config.service';

type ConfigValues = {
  TASK_ROUTING_DECISION_MODE?: string;
  TASK_ROUTING_MIN_CONFIDENCE?: number;
};

describe('TaskRoutingService', () => {
  let service: TaskRoutingService;
  let skillsService: { resolveBrandSkills: ReturnType<typeof vi.fn> };
  let typedDecisionService: { choose: ReturnType<typeof vi.fn> };
  let configValues: ConfigValues;

  /**
   * The Jev provider is mocked everywhere: no spec may depend on a live
   * decision provider, and the service contract is that a `null` answer is
   * indistinguishable from a sub-threshold one.
   */
  const buildService = (overrides: ConfigValues = {}): TaskRoutingService => {
    configValues = { TASK_ROUTING_DECISION_MODE: 'off', ...overrides };
    const configService = {
      get: (key: keyof ConfigValues) => configValues[key],
    };

    return new TaskRoutingService(
      skillsService as unknown as SkillsService,
      typedDecisionService as unknown as TypedDecisionService,
      configService as unknown as ConfigService,
    );
  };

  beforeEach(() => {
    skillsService = { resolveBrandSkills: vi.fn().mockResolvedValue([]) };
    typedDecisionService = { choose: vi.fn().mockResolvedValue(null) };
    service = buildService();
  });

  const dto = (overrides: Record<string, unknown>): CreateTaskDto =>
    ({ ...overrides }) as unknown as CreateTaskDto;

  describe('keyword fallback routing (mode off)', () => {
    it.each([
      [
        'Make a 30s video reel for launch',
        'video',
        'video_generation',
        'in_progress',
        false,
      ],
      [
        'Write a newsletter issue for subscribers',
        'newsletter',
        'caption_generation',
        'backlog',
        true,
      ],
      [
        'Draft a tweet thread with a hook',
        'post',
        'caption_generation',
        'backlog',
        true,
      ],
      [
        'Write a caption / copy for the photo',
        'caption',
        'caption_generation',
        'backlog',
        true,
      ],
      [
        'Create a thumbnail image visual',
        'image',
        'image_generation',
        'in_progress',
        false,
      ],
      [
        'Some broad open-ended request',
        'ingredient',
        'agent_orchestrator',
        'backlog',
        false,
      ],
    ])(
      'routes "%s" → %s via %s',
      async (request, outputType, executionPathUsed, status, reviewTriggered) => {
        const decision = await service.buildRoutingDecision(
          dto({ request }),
          'Title',
        );

        expect(decision.outputType).toBe(outputType);
        expect(decision.executionPathUsed).toBe(executionPathUsed);
        expect(decision.status).toBe(status);
        expect(decision.reviewTriggered).toBe(reviewTriggered);
        expect(decision.chosenProvider).toBe('genfeed-router');
        expect(decision.skillsUsed).toEqual([]);
      },
    );

    it('honours an explicit outputType over keyword inference', async () => {
      const decision = await service.buildRoutingDecision(
        dto({ outputType: 'image', request: 'write a video script' }),
        'Title',
      );

      expect(decision.outputType).toBe('image');
      expect(decision.executionPathUsed).toBe('image_generation');
      expect(decision.status).toBe('in_progress');
    });

    it('does not look up skills when brand/organization are missing', async () => {
      await service.buildRoutingDecision(dto({ request: 'make a video' }), 'T');
      expect(skillsService.resolveBrandSkills).not.toHaveBeenCalled();
    });
  });

  describe('skill-driven routing', () => {
    it('uses a matched brand skill that requires approval', async () => {
      skillsService.resolveBrandSkills.mockResolvedValue([
        {
          targetSkill: {
            name: 'Newsletter Pro',
            requiredProviders: ['beehiiv'],
            reviewDefaults: { requiresApproval: true },
            slug: 'newsletter-pro',
            workflowStage: 'creation',
          },
          variant: { id: 'variant-123' },
        },
      ]);

      const decision = await service.buildRoutingDecision(
        dto({
          brandId: 'brand-1',
          organizationId: 'org-1',
          request: 'write a newsletter',
        }),
        'Weekly digest',
      );

      expect(skillsService.resolveBrandSkills).toHaveBeenCalledWith(
        'org-1',
        'brand-1',
        expect.objectContaining({ workflowStage: 'creation' }),
      );
      expect(decision.chosenProvider).toBe('beehiiv');
      expect(decision.reviewState).toBe('pending_approval');
      expect(decision.reviewTriggered).toBe(true);
      expect(decision.status).toBe('in_review');
      expect(decision.skillsUsed).toEqual(['newsletter-pro']);
      expect(decision.skillVariantIds).toEqual(['variant-123']);
      expect(decision.resultPreview).toContain('Newsletter Pro');
      expect(decision.resultPreview).toContain('Weekly digest');
    });

    it('falls back to keyword routing when no skill matches', async () => {
      skillsService.resolveBrandSkills.mockResolvedValue([]);

      const decision = await service.buildRoutingDecision(
        dto({
          brandId: 'brand-1',
          organizationId: 'org-1',
          request: 'make a video',
        }),
        'Title',
      );

      expect(decision.outputType).toBe('video');
      expect(decision.skillsUsed).toEqual([]);
    });
  });

  describe('output-type decision point (#4867)', () => {
    const decisionDto = (request: string): CreateTaskDto =>
      dto({
        brandId: 'brand-1',
        linkedEntities: [
          { entityId: 'ingredient-1', entityModel: 'Ingredient' },
        ],
        organizationId: 'org-1',
        platforms: ['TikTok'],
        request,
        userId: 'user-1',
      });

    it('never calls the provider in off mode', async () => {
      const decision = await service.buildRoutingDecision(
        decisionDto('make a video'),
        'Title',
      );

      expect(typedDecisionService.choose).not.toHaveBeenCalled();
      expect(decision.outputType).toBe('video');
      expect(decision.outputTypeSource).toBe('keyword');
      expect(decision.outputTypeConfidence).toBeUndefined();
    });

    it('sends the request text and the structured hints as decision state', async () => {
      service = buildService({ TASK_ROUTING_DECISION_MODE: 'shadow' });

      await service.buildRoutingDecision(
        decisionDto('make something for the drop'),
        'Title',
      );

      expect(typedDecisionService.choose).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.arrayContaining(['ingredient', 'video']),
          state: {
            attachmentCount: 1,
            hasBrand: true,
            platforms: ['tiktok'],
            request: 'make something for the drop',
          },
        }),
        expect.objectContaining({
          brandId: 'brand-1',
          decisionPoint: 'task_routing.output_type',
          deterministicAnswer: 'ingredient',
          mode: 'shadow',
          organizationId: 'org-1',
          userId: 'user-1',
        }),
      );
    });

    it('acts on the keyword answer in shadow mode even when the provider is confident', async () => {
      service = buildService({ TASK_ROUTING_DECISION_MODE: 'shadow' });
      typedDecisionService.choose.mockResolvedValue({
        confidence: 0.99,
        value: 'newsletter',
      });

      const decision = await service.buildRoutingDecision(
        decisionDto('make a video'),
        'Title',
      );

      expect(typedDecisionService.choose).toHaveBeenCalledTimes(1);
      expect(decision.outputType).toBe('video');
      expect(decision.outputTypeSource).toBe('keyword');
    });

    it('caps a configured live mode at shadow — the provider never overrides the keyword answer', async () => {
      service = buildService({
        TASK_ROUTING_DECISION_MODE: 'live',
        TASK_ROUTING_MIN_CONFIDENCE: 0.85,
      });
      typedDecisionService.choose.mockResolvedValue({
        confidence: 0.99,
        value: 'newsletter',
      });

      const decision = await service.buildRoutingDecision(
        decisionDto('put together the monthly round-up for subscribers'),
        'Title',
      );

      // Jev still computed and was still called (shadow telemetry), but the
      // request-routing decision point (#4867, release-blocker follow-up to
      // epic #4863) can no longer dispatch on it — `live` is not reachable.
      expect(typedDecisionService.choose).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ mode: 'shadow' }),
      );
      expect(decision.outputType).toBe('ingredient');
      expect(decision.outputTypeSource).toBe('keyword');
      expect(decision.outputTypeConfidence).toBeUndefined();
    });

    it('treats a null answer exactly like the shadow-mode fallback', async () => {
      service = buildService({ TASK_ROUTING_DECISION_MODE: 'live' });
      typedDecisionService.choose.mockResolvedValue(null);

      const decision = await service.buildRoutingDecision(
        decisionDto('make a video'),
        'Title',
      );

      expect(decision.outputType).toBe('video');
      expect(decision.outputTypeSource).toBe('keyword');
    });

    it('does not decide an explicitly requested output type', async () => {
      service = buildService({ TASK_ROUTING_DECISION_MODE: 'live' });

      const decision = await service.buildRoutingDecision(
        dto({ outputType: 'image', request: 'write a video script' }),
        'Title',
      );

      expect(typedDecisionService.choose).not.toHaveBeenCalled();
      expect(decision.outputType).toBe('image');
      expect(decision.outputTypeSource).toBe('explicit');
    });

    it('does not call the provider for an empty request', async () => {
      service = buildService({ TASK_ROUTING_DECISION_MODE: 'live' });

      const decision = await service.buildRoutingDecision(
        dto({ request: '   ' }),
        'Title',
      );

      expect(typedDecisionService.choose).not.toHaveBeenCalled();
      expect(decision.outputType).toBe('ingredient');
    });

    it('keeps the facet filter authoritative on the keyword modality, not the shadowed provider answer', async () => {
      service = buildService({ TASK_ROUTING_DECISION_MODE: 'live' });
      typedDecisionService.choose.mockResolvedValue({
        confidence: 0.97,
        value: 'image',
      });
      skillsService.resolveBrandSkills.mockResolvedValue([]);

      const decision = await service.buildRoutingDecision(
        decisionDto('something for the launch'),
        'Title',
      );

      expect(skillsService.resolveBrandSkills).toHaveBeenCalledWith(
        'org-1',
        'brand-1',
        expect.objectContaining({
          channel: 'tiktok',
          modality: 'text',
          workflowStage: 'creation',
        }),
      );
      expect(decision.outputType).toBe('ingredient');
    });

    it('carries no decision provenance onto a skill-driven decision — the answer is shadowed only', async () => {
      service = buildService({ TASK_ROUTING_DECISION_MODE: 'live' });
      typedDecisionService.choose.mockResolvedValue({
        confidence: 0.93,
        value: 'post',
      });
      skillsService.resolveBrandSkills.mockResolvedValue([
        {
          targetSkill: {
            name: 'Hook Writer',
            reviewDefaults: { requiresApproval: false },
            slug: 'hook-writer',
            workflowStage: 'creation',
          },
          variant: null,
        },
      ]);

      const decision = await service.buildRoutingDecision(
        decisionDto('post this hook'),
        'Title',
      );

      expect(decision.skillsUsed).toEqual(['hook-writer']);
      expect(decision.outputType).toBe('post');
      expect(decision.outputTypeSource).toBe('keyword');
      expect(decision.outputTypeConfidence).toBeUndefined();
    });
  });
});

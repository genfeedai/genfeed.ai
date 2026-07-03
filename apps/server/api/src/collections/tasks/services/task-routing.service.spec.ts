import { SkillsService } from '@api/collections/skills/services/skills.service';
import type { CreateTaskDto } from '@api/collections/tasks/dto/create-task.dto';
import { TaskRoutingService } from '@api/collections/tasks/services/task-routing.service';

describe('TaskRoutingService', () => {
  let service: TaskRoutingService;
  let skillsService: { resolveBrandSkills: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    skillsService = { resolveBrandSkills: vi.fn().mockResolvedValue([]) };
    service = new TaskRoutingService(skillsService as unknown as SkillsService);
  });

  const dto = (overrides: Record<string, unknown>): CreateTaskDto =>
    ({ ...overrides }) as unknown as CreateTaskDto;

  describe('keyword fallback routing', () => {
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
    ])('routes "%s" → %s via %s', async (request, outputType, executionPathUsed, status, reviewTriggered) => {
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
    });

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
          brand: 'brand-1',
          organization: 'org-1',
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
          brand: 'brand-1',
          organization: 'org-1',
          request: 'make a video',
        }),
        'Title',
      );

      expect(decision.outputType).toBe('video');
      expect(decision.skillsUsed).toEqual([]);
    });
  });
});

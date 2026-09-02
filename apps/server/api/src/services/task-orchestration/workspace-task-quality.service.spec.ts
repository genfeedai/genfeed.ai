import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { WorkspaceTaskQualityService } from '@api/services/task-orchestration/workspace-task-quality.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('WorkspaceTaskQualityService', () => {
  const llmDispatcherService = {
    chatCompletion: vi.fn(),
  };

  const loggerService = {
    warn: vi.fn(),
  };

  const assessmentInput = {
    outputType: 'post',
    platforms: ['x'],
    request:
      'Write a founder post about why open source GTM needs quality gates.',
    summaries: ['Open source GTM without quality gates just ships mediocrity.'],
  };

  let service: WorkspaceTaskQualityService;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspaceTaskQualityService,
        { provide: LlmDispatcherService, useValue: llmDispatcherService },
        { provide: LoggerService, useValue: loggerService },
      ],
    }).compile();

    service = module.get(WorkspaceTaskQualityService);
  });

  it('returns the parsed LLM assessment when valid JSON is provided', async () => {
    llmDispatcherService.chatCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              dimensions: [
                {
                  label: 'voice_match',
                  notes: 'Sharp founder tone.',
                  score: 0.91,
                },
                {
                  label: 'hook_strength',
                  notes: 'Strong opening claim.',
                  score: 0.88,
                },
              ],
              gate: 'pass',
              score: 0.9,
              suggestedFixes: ['Run a final human edit before publish.'],
              summary: 'The draft is clear and high-signal.',
              winnerSummary:
                'The post opens with a contrarian claim and backs it with proof.',
            }),
          },
        },
      ],
    });

    const result = await service.assess(assessmentInput, 'org-1');

    expect(result).toMatchObject({
      gate: 'pass',
      repairLoopUsed: false,
      rubricVersion: 'founder-gtm-v1',
      score: 0.9,
      summary: 'The draft is clear and high-signal.',
      winnerSummary:
        'The post opens with a contrarian claim and backs it with proof.',
    });
    expect(result.dimensions).toHaveLength(2);
    expect(llmDispatcherService.chatCompletion).toHaveBeenCalledOnce();
  });

  it('falls back to heuristic scoring when the LLM response is invalid', async () => {
    llmDispatcherService.chatCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content: 'not-json',
          },
        },
      ],
    });

    const result = await service.assess(assessmentInput, 'org-1');

    expect(result.rubricVersion).toBe('founder-gtm-v1');
    expect(result.dimensions).toHaveLength(3);
    expect(result.gate).toBe('needs_revision');
    expect(result.summary).toContain('quality gate flagged');
    expect(result.winnerSummary).toBe(assessmentInput.summaries[0]);
  });
});

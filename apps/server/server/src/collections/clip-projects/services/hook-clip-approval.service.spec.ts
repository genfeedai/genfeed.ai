import type { ClipProjectsService } from '@server/collections/clip-projects/clip-projects.service';
import type { ClipResultsService } from '@server/collections/clip-results/clip-results.service';
import type { CreditsUtilsService } from '@server/collections/credits/services/credits.utils.service';
import { InsufficientCreditsException } from '@server/exceptions/business-logic.exception';
import type { ClipOrchestratorService } from '@server/services/clip-orchestrator/clip-orchestrator.service';
import { ClipRunState } from '@server/services/clip-orchestrator/clip-run-state.enum';
import { BadRequestException } from '@nestjs/common';
import type { Mocked } from 'vitest';
import type {
  ClipGenerationInput,
  ClipGenerationService,
} from './clip-generation.service';
import { HookClipApprovalService } from './hook-clip-approval.service';

const hookInput: ClipGenerationInput = {
  avatarId: 'avatar-1',
  highlights: [
    {
      clip_type: 'hook',
      end_time: 5,
      start_time: 0,
      summary: 'Stop scrolling',
      tags: ['hook'],
      title: 'Hook',
      virality_score: 95,
    },
  ],
  hookApprovalRequired: false,
  orgId: 'org-1',
  projectId: 'project-1',
  runReferences: [
    {
      assetId: 'face-1',
      description: 'Hero character sheet',
      role: 'character',
      url: 'https://cdn.example.com/face.png',
    },
  ],
  userId: 'user-1',
  voiceId: 'voice-1',
};

const remainingInput: ClipGenerationInput = {
  ...hookInput,
  highlights: [
    {
      clip_type: 'body',
      end_time: 10,
      start_time: 5,
      summary: 'The product story',
      tags: ['body'],
      title: 'Body',
      virality_score: 80,
    },
  ],
};

function makeRun(state: ClipRunState = ClipRunState.Generating) {
  return {
    confirmationRequired: true,
    createdAt: new Date(),
    currentState: state,
    id: 'run-1',
    metadata: {
      hookApproval: {
        attempt: 1,
        hookClipResultId: 'hook-result-1',
        hookInput,
        phase: 'generating_hook',
        remainingInput,
      },
    },
    organizationId: 'org-1',
    projectId: 'project-1',
    runReferences: [],
    skipMerging: false,
    steps: [],
    updatedAt: new Date(),
    userId: 'user-1',
  };
}

describe('HookClipApprovalService', () => {
  let service: HookClipApprovalService;
  let orchestrator: Mocked<
    Pick<
      ClipOrchestratorService,
      | 'claimConfirmation'
      | 'completeStep'
      | 'confirm'
      | 'getProjectRun'
      | 'reject'
      | 'requestConfirmation'
      | 'updateMetadata'
    >
  >;
  let clipResults: Mocked<Pick<ClipResultsService, 'findOne' | 'patch'>>;
  let generation: Mocked<Pick<ClipGenerationService, 'generateClips'>>;
  let projects: Mocked<Pick<ClipProjectsService, 'patch'>>;
  let credits: Mocked<
    Pick<
      CreditsUtilsService,
      'checkOrganizationCreditsAvailable' | 'getOrganizationCreditsBalance'
    >
  >;

  beforeEach(() => {
    orchestrator = {
      claimConfirmation: vi.fn().mockResolvedValue(true),
      completeStep: vi.fn().mockResolvedValue(makeRun()),
      confirm: vi.fn().mockResolvedValue(makeRun(ClipRunState.Generating)),
      getProjectRun: vi.fn().mockResolvedValue(makeRun()),
      reject: vi.fn().mockResolvedValue(makeRun(ClipRunState.Failed)),
      requestConfirmation: vi
        .fn()
        .mockResolvedValue(makeRun(ClipRunState.AwaitingConfirmation)),
      updateMetadata: vi.fn().mockResolvedValue(makeRun()),
    };
    clipResults = {
      findOne: vi.fn().mockResolvedValue({
        id: 'hook-result-1',
        status: 'completed',
      } as never),
      patch: vi.fn().mockResolvedValue({} as never),
    };
    generation = {
      generateClips: vi.fn().mockResolvedValue({
        clipResultIds: ['remaining-result-1'],
        providerJobIds: ['remaining-job-1'],
        queuedClipCount: 1,
      }),
    };
    projects = { patch: vi.fn().mockResolvedValue({} as never) };
    credits = {
      checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
      getOrganizationCreditsBalance: vi.fn().mockResolvedValue(20),
    };
    service = new HookClipApprovalService(
      orchestrator as unknown as ClipOrchestratorService,
      clipResults as unknown as ClipResultsService,
      generation as unknown as ClipGenerationService,
      projects as unknown as ClipProjectsService,
      credits as unknown as CreditsUtilsService,
    );
  });

  it('exposes a decision only after the hook clip completes', async () => {
    await expect(service.getStatus('project-1', 'org-1')).resolves.toEqual(
      expect.objectContaining({
        hookClipResultId: 'hook-result-1',
        remainingClipCount: 1,
        state: 'awaiting_confirmation',
      }),
    );
    expect(orchestrator.requestConfirmation).toHaveBeenCalledWith(
      'run-1',
      ClipRunState.Generating,
    );
    expect(orchestrator.completeStep).toHaveBeenCalledWith('run-1', {
      hookClipResultId: 'hook-result-1',
    });

    clipResults.findOne.mockResolvedValueOnce({
      id: 'hook-result-1',
      status: 'extracting',
    } as never);
    await expect(service.getStatus('project-1', 'org-1')).resolves.toEqual(
      expect.objectContaining({ state: 'generating_hook' }),
    );
  });

  it('approves once, checks remaining credits, and resumes with the immutable references', async () => {
    orchestrator.getProjectRun.mockResolvedValue(
      makeRun(ClipRunState.AwaitingConfirmation),
    );

    const result = await service.submitDecision({
      action: 'approve',
      organizationId: 'org-1',
      projectId: 'project-1',
      userId: 'user-1',
    });

    expect(orchestrator.claimConfirmation).toHaveBeenCalledWith('run-1', 1);
    expect(credits.checkOrganizationCreditsAvailable).toHaveBeenCalledWith(
      'org-1',
      1,
    );
    expect(orchestrator.confirm).toHaveBeenCalledWith('run-1');
    expect(generation.generateClips).toHaveBeenCalledWith(remainingInput);
    expect(result.state).toBe('approved');
  });

  it('request-changes regenerates only the hook and leaves remaining clips undispatched', async () => {
    orchestrator.getProjectRun.mockResolvedValue(
      makeRun(ClipRunState.AwaitingConfirmation),
    );
    generation.generateClips.mockResolvedValueOnce({
      clipResultIds: ['hook-result-2'],
      providerJobIds: ['hook-job-2'],
      queuedClipCount: 1,
    });

    const result = await service.submitDecision({
      action: 'request_changes',
      feedback: 'Use a warmer delivery and hold eye contact.',
      organizationId: 'org-1',
      projectId: 'project-1',
      userId: 'user-1',
    });

    expect(credits.checkOrganizationCreditsAvailable).toHaveBeenCalledWith(
      'org-1',
      1,
    );
    expect(generation.generateClips).toHaveBeenCalledTimes(1);
    expect(generation.generateClips).toHaveBeenCalledWith(
      expect.objectContaining({
        highlights: [
          expect.objectContaining({
            summary:
              'Stop scrolling\nRevision guidance: Use a warmer delivery and hold eye contact.',
          }),
        ],
        runReferences: hookInput.runReferences,
      }),
    );
    expect(orchestrator.updateMetadata).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({
        hookApproval: expect.objectContaining({
          attempt: 2,
          feedback: 'Use a warmer delivery and hold eye contact.',
          hookClipResultId: 'hook-result-2',
          phase: 'generating_hook',
        }),
      }),
    );
    expect(clipResults.patch).toHaveBeenCalledWith('hook-result-1', {
      isDeleted: true,
    });
    expect(result.state).toBe('generating_hook');
  });

  it('rejects without checking credits or dispatching remaining clips', async () => {
    orchestrator.getProjectRun.mockResolvedValue(
      makeRun(ClipRunState.AwaitingConfirmation),
    );

    const result = await service.submitDecision({
      action: 'reject',
      feedback: 'The identity is not usable.',
      organizationId: 'org-1',
      projectId: 'project-1',
      userId: 'user-1',
    });

    expect(credits.checkOrganizationCreditsAvailable).not.toHaveBeenCalled();
    expect(generation.generateClips).not.toHaveBeenCalled();
    expect(orchestrator.reject).toHaveBeenCalledWith(
      'run-1',
      'The identity is not usable.',
    );
    expect(projects.patch).toHaveBeenCalledWith('project-1', {
      error: 'The identity is not usable.',
      progress: 100,
      status: 'failed',
    });
    expect(result.state).toBe('rejected');
  });

  it('does not dispatch when another reviewer already claimed the decision', async () => {
    orchestrator.getProjectRun.mockResolvedValue(
      makeRun(ClipRunState.AwaitingConfirmation),
    );
    orchestrator.claimConfirmation.mockResolvedValue(false);

    await expect(
      service.submitDecision({
        action: 'approve',
        organizationId: 'org-1',
        projectId: 'project-1',
        userId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(generation.generateClips).not.toHaveBeenCalled();
  });

  it('checks credits before claiming approval or dispatching remaining clips', async () => {
    orchestrator.getProjectRun.mockResolvedValue(
      makeRun(ClipRunState.AwaitingConfirmation),
    );
    credits.checkOrganizationCreditsAvailable.mockResolvedValue(false);
    credits.getOrganizationCreditsBalance.mockResolvedValue(0);

    await expect(
      service.submitDecision({
        action: 'approve',
        organizationId: 'org-1',
        projectId: 'project-1',
        userId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(InsufficientCreditsException);
    expect(orchestrator.claimConfirmation).not.toHaveBeenCalled();
    expect(generation.generateClips).not.toHaveBeenCalled();
  });
});

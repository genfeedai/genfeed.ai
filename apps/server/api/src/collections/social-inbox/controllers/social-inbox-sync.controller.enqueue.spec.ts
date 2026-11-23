import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { SocialInboxSyncController } from '@api/collections/social-inbox/controllers/social-inbox-sync.controller';
import type { SocialInboxSyncWorkflowService } from '@api/collections/social-inbox/services/social-inbox-sync-workflow.service';
import { Platform, SocialConversationType } from '@genfeedai/contracts';
import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

function buildUser(): AuthenticatedUser {
  return {
    brandId: 'brand-1',
    organizationId: 'org-1',
    userId: 'user-1',
  } as unknown as AuthenticatedUser;
}

function createController() {
  const queued: Array<Record<string, unknown>> = [];
  return {
    controller: new SocialInboxSyncController({
      enqueue: async (input: Record<string, unknown>) => {
        queued.push(input);
        return `job-${queued.length}`;
      },
    } as unknown as SocialInboxSyncWorkflowService),
    queued,
  };
}

describe('SocialInboxSyncController sync enqueue', () => {
  it('queues the YouTube sync workflow instead of ingesting inline', async () => {
    const { controller, queued } = createController();

    await expect(
      controller.syncYoutubeComments(buildUser(), {
        credentialId: 'credential-1',
        limit: 50,
      }),
    ).resolves.toEqual({ jobId: 'job-1', status: 'queued' });

    expect(queued).toEqual([
      {
        brandId: 'brand-1',
        conversationType: SocialConversationType.COMMENT,
        credentialId: 'credential-1',
        limit: 50,
        organizationId: 'org-1',
        platform: Platform.YOUTUBE,
        userId: 'user-1',
      },
    ]);
  });

  it('preserves each platform and conversation surface in workflow input', async () => {
    const { controller, queued } = createController();

    await expect(controller.syncInstagramDms(buildUser(), {})).resolves.toEqual(
      { jobId: 'job-1', status: 'queued' },
    );
    await expect(
      controller.syncXComments(buildUser(), { limit: 25 }),
    ).resolves.toEqual({ jobId: 'job-2', status: 'queued' });
    await expect(
      controller.syncLinkedInComments(buildUser(), {}),
    ).resolves.toEqual({ jobId: 'job-3', status: 'queued' });
    await expect(
      controller.syncThreadsReplies(buildUser(), {}),
    ).resolves.toEqual({ jobId: 'job-4', status: 'queued' });

    expect(
      queued.map((job) => [job.platform, job.conversationType, job.limit]),
    ).toEqual([
      [Platform.INSTAGRAM, SocialConversationType.DM, undefined],
      [Platform.TWITTER, SocialConversationType.COMMENT, 25],
      [Platform.LINKEDIN, SocialConversationType.COMMENT, undefined],
      [Platform.THREADS, SocialConversationType.COMMENT, undefined],
    ]);
  });

  it('rejects a request without an organization context', async () => {
    const { controller, queued } = createController();
    const anonymous = {} as unknown as AuthenticatedUser;

    await expect(controller.syncYoutubeComments(anonymous, {})).rejects.toThrow(
      UnauthorizedException,
    );
    expect(queued).toEqual([]);
  });
});

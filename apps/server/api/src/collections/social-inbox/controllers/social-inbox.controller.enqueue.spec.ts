import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { SocialInboxController } from '@api/collections/social-inbox/controllers/social-inbox.controller';
import type { SocialInboxService } from '@api/collections/social-inbox/services/social-inbox.service';
import type { SocialInboxSuggestedReplyService } from '@api/collections/social-inbox/services/social-inbox-suggested-reply.service';
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
  const ingested: unknown[] = [];
  return {
    controller: new SocialInboxController(
      {
        ingestYoutubeComments: async (input: unknown) => {
          ingested.push(input);
        },
      } as unknown as SocialInboxService,
      {
        enqueue: async (input: Record<string, unknown>) => {
          queued.push(input);
          return `job-${queued.length}`;
        },
      } as unknown as SocialInboxSyncWorkflowService,
      {
        suggestReply: async () => null,
      } as unknown as SocialInboxSuggestedReplyService,
    ),
    ingested,
    queued,
  };
}

describe('SocialInboxController sync enqueue', () => {
  it('queues the YouTube sync workflow instead of ingesting inline', async () => {
    const { controller, ingested, queued } = createController();

    await expect(
      controller.syncYoutubeComments(buildUser(), {
        credentialId: 'credential-1',
        limit: 50,
      }),
    ).resolves.toEqual({ jobId: 'job-1', status: 'queued' });

    expect(ingested).toEqual([]);
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

    expect(
      queued.map((job) => [job.platform, job.conversationType, job.limit]),
    ).toEqual([
      [Platform.INSTAGRAM, SocialConversationType.DM, undefined],
      [Platform.TWITTER, SocialConversationType.COMMENT, 25],
      [Platform.LINKEDIN, SocialConversationType.COMMENT, undefined],
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

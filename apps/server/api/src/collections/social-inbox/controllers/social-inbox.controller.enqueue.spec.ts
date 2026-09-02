import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { SocialInboxController } from '@api/collections/social-inbox/controllers/social-inbox.controller';
import type { SocialInboxService } from '@api/collections/social-inbox/services/social-inbox.service';
import type { SocialInboxSyncWorkflowService } from '@api/collections/social-inbox/services/social-inbox-sync-workflow.service';
import { Platform, SocialConversationType } from '@genfeedai/enums';
import { UnauthorizedException } from '@nestjs/common';
import { vi } from 'vitest';

function buildUser(): AuthenticatedUser {
  return {
    brandId: 'brand-1',
    organizationId: 'org-1',
    userId: 'user-1',
  } as unknown as AuthenticatedUser;
}

function createController() {
  const ingestYoutubeComments = vi.fn();
  const enqueue = vi.fn().mockResolvedValue('job-1');
  return {
    controller: new SocialInboxController(
      { ingestYoutubeComments } as unknown as SocialInboxService,
      { enqueue } as unknown as SocialInboxSyncWorkflowService,
    ),
    enqueue,
    ingestYoutubeComments,
  };
}

describe('SocialInboxController sync enqueue', () => {
  it('queues the YouTube sync workflow instead of ingesting inline', async () => {
    const { controller, enqueue, ingestYoutubeComments } = createController();

    await expect(
      controller.syncYoutubeComments(buildUser(), {
        credentialId: 'credential-1',
        limit: 50,
      }),
    ).resolves.toEqual({ jobId: 'job-1', status: 'queued' });

    expect(ingestYoutubeComments).not.toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalledWith({
      brandId: 'brand-1',
      conversationType: SocialConversationType.COMMENT,
      credentialId: 'credential-1',
      limit: 50,
      organizationId: 'org-1',
      platform: Platform.YOUTUBE,
      userId: 'user-1',
    });
  });

  it('preserves each platform and conversation surface in workflow input', async () => {
    const { controller, enqueue } = createController();

    await controller.syncInstagramDms(buildUser(), {});
    await controller.syncXComments(buildUser(), { limit: 25 });
    await controller.syncLinkedInComments(buildUser(), {});

    expect(enqueue).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        conversationType: SocialConversationType.DM,
        platform: Platform.INSTAGRAM,
      }),
    );
    expect(enqueue).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        conversationType: SocialConversationType.COMMENT,
        platform: Platform.TWITTER,
      }),
    );
    expect(enqueue).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        conversationType: SocialConversationType.COMMENT,
        platform: Platform.LINKEDIN,
      }),
    );
  });

  it('rejects a request without an organization context', async () => {
    const { controller, enqueue } = createController();
    const anonymous = {} as unknown as AuthenticatedUser;

    await expect(controller.syncYoutubeComments(anonymous, {})).rejects.toThrow(
      UnauthorizedException,
    );
    expect(enqueue).not.toHaveBeenCalled();
  });
});

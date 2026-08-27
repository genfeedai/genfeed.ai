import type { AuthenticatedUser } from '@server/auth/interfaces/authenticated-user.interface';
import { SocialInboxController } from '@api/collections/social-inbox/controllers/social-inbox.controller';
import type { SocialInboxService } from '@server/collections/social-inbox/services/social-inbox.service';
import type { QueueService } from '@server/queues/core/queue.service';
import { Platform, SocialConversationType } from '@genfeedai/enums';
import { SOCIAL_INBOX_SYNC_QUEUE } from '@genfeedai/queue-contracts';
import { UnauthorizedException } from '@nestjs/common';
import { vi } from 'vitest';

function buildUser(): AuthenticatedUser {
  return {
    brandId: 'brand-1',
    organizationId: 'org-1',
    userId: 'user-1',
  } as unknown as AuthenticatedUser;
}

describe('SocialInboxController sync enqueue', () => {
  it('enqueues a background sync job instead of ingesting on the request thread', async () => {
    const ingestYoutubeComments = vi.fn();
    const add = vi.fn().mockResolvedValue({ id: 'job-1' });
    const controller = new SocialInboxController(
      { ingestYoutubeComments } as unknown as SocialInboxService,
      { add } as unknown as QueueService,
    );

    const result = await controller.syncYoutubeComments(buildUser(), {
      credentialId: 'credential-1',
      limit: 50,
    });

    // Never runs the sweep inline.
    expect(ingestYoutubeComments).not.toHaveBeenCalled();
    // Enqueues with the org-scoped job payload.
    expect(add).toHaveBeenCalledWith(SOCIAL_INBOX_SYNC_QUEUE, {
      brandId: 'brand-1',
      conversationType: SocialConversationType.COMMENT,
      credentialId: 'credential-1',
      limit: 50,
      organizationId: 'org-1',
      platform: Platform.YOUTUBE,
      userId: 'user-1',
    });
    expect(result).toEqual({ jobId: 'job-1', status: 'queued' });
  });

  it('tags the Instagram comment sweep with its own platform', async () => {
    const add = vi.fn().mockResolvedValue({ id: 'job-2' });
    const ingestInstagramComments = vi.fn();
    const controller = new SocialInboxController(
      { ingestInstagramComments } as unknown as SocialInboxService,
      { add } as unknown as QueueService,
    );

    const result = await controller.syncInstagramComments(buildUser(), {
      limit: 25,
    });

    expect(ingestInstagramComments).not.toHaveBeenCalled();
    expect(add).toHaveBeenCalledWith(SOCIAL_INBOX_SYNC_QUEUE, {
      brandId: 'brand-1',
      conversationType: SocialConversationType.COMMENT,
      credentialId: undefined,
      limit: 25,
      organizationId: 'org-1',
      platform: Platform.INSTAGRAM,
      userId: 'user-1',
    });
    expect(result).toEqual({ jobId: 'job-2', status: 'queued' });
  });

  it('tags the Instagram DM sweep with the dm conversation type', async () => {
    const add = vi.fn().mockResolvedValue({ id: 'job-3' });
    const ingestInstagramDms = vi.fn();
    const controller = new SocialInboxController(
      { ingestInstagramDms } as unknown as SocialInboxService,
      { add } as unknown as QueueService,
    );

    await controller.syncInstagramDms(buildUser(), {});

    expect(ingestInstagramDms).not.toHaveBeenCalled();
    expect(add).toHaveBeenCalledWith(
      SOCIAL_INBOX_SYNC_QUEUE,
      expect.objectContaining({
        conversationType: SocialConversationType.DM,
        platform: Platform.INSTAGRAM,
      }),
    );
  });

  it('tags the X mention/reply sweep with the twitter comment surface', async () => {
    const add = vi.fn().mockResolvedValue({ id: 'job-4' });
    const ingestXComments = vi.fn();
    const controller = new SocialInboxController(
      { ingestXComments } as unknown as SocialInboxService,
      { add } as unknown as QueueService,
    );

    const result = await controller.syncXComments(buildUser(), { limit: 25 });

    expect(ingestXComments).not.toHaveBeenCalled();
    expect(add).toHaveBeenCalledWith(SOCIAL_INBOX_SYNC_QUEUE, {
      brandId: 'brand-1',
      conversationType: SocialConversationType.COMMENT,
      credentialId: undefined,
      limit: 25,
      organizationId: 'org-1',
      platform: Platform.TWITTER,
      userId: 'user-1',
    });
    expect(result).toEqual({ jobId: 'job-4', status: 'queued' });
  });

  it('tags the X and LinkedIn DM sweeps with their platforms', async () => {
    const add = vi.fn().mockResolvedValue({ id: 'job-5' });
    const controller = new SocialInboxController(
      {} as unknown as SocialInboxService,
      { add } as unknown as QueueService,
    );

    await controller.syncXDms(buildUser(), {});
    await controller.syncLinkedInComments(buildUser(), {});
    await controller.syncLinkedInDms(buildUser(), {});

    expect(add).toHaveBeenNthCalledWith(
      1,
      SOCIAL_INBOX_SYNC_QUEUE,
      expect.objectContaining({
        conversationType: SocialConversationType.DM,
        platform: Platform.TWITTER,
      }),
    );
    expect(add).toHaveBeenNthCalledWith(
      2,
      SOCIAL_INBOX_SYNC_QUEUE,
      expect.objectContaining({
        conversationType: SocialConversationType.COMMENT,
        platform: Platform.LINKEDIN,
      }),
    );
    expect(add).toHaveBeenNthCalledWith(
      3,
      SOCIAL_INBOX_SYNC_QUEUE,
      expect.objectContaining({
        conversationType: SocialConversationType.DM,
        platform: Platform.LINKEDIN,
      }),
    );
  });

  it('rejects a request without an organization context', async () => {
    const add = vi.fn();
    const controller = new SocialInboxController(
      { ingestYoutubeComments: vi.fn() } as unknown as SocialInboxService,
      { add } as unknown as QueueService,
    );
    const anonymous = {} as unknown as AuthenticatedUser;

    await expect(controller.syncYoutubeComments(anonymous, {})).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(
      controller.syncInstagramComments(anonymous, {}),
    ).rejects.toThrow(UnauthorizedException);
    await expect(controller.syncInstagramDms(anonymous, {})).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(controller.syncXComments(anonymous, {})).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(controller.syncXDms(anonymous, {})).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(
      controller.syncLinkedInComments(anonymous, {}),
    ).rejects.toThrow(UnauthorizedException);
    await expect(controller.syncLinkedInDms(anonymous, {})).rejects.toThrow(
      UnauthorizedException,
    );
    expect(add).not.toHaveBeenCalled();
  });
});

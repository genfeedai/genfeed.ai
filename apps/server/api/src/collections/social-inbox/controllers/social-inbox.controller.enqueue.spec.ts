import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { SocialInboxController } from '@api/collections/social-inbox/controllers/social-inbox.controller';
import type { SocialInboxService } from '@api/collections/social-inbox/services/social-inbox.service';
import type { QueueService } from '@api/queues/core/queue.service';
import { SOCIAL_INBOX_SYNC_QUEUE } from '@genfeedai/queue-contracts';
import { UnauthorizedException } from '@nestjs/common';
import { vi } from 'vitest';

function buildUser(): AuthenticatedUser {
  return {
    publicMetadata: {
      brand: 'brand-1',
      organization: 'org-1',
      user: 'user-1',
    },
  } as unknown as AuthenticatedUser;
}

describe('SocialInboxController youtube/sync enqueue', () => {
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
      credentialId: 'credential-1',
      limit: 50,
      organizationId: 'org-1',
      userId: 'user-1',
    });
    expect(result).toEqual({ jobId: 'job-1', status: 'queued' });
  });

  it('rejects a request without an organization context', async () => {
    const add = vi.fn();
    const controller = new SocialInboxController(
      { ingestYoutubeComments: vi.fn() } as unknown as SocialInboxService,
      { add } as unknown as QueueService,
    );

    await expect(
      controller.syncYoutubeComments(
        { publicMetadata: {} } as unknown as AuthenticatedUser,
        {},
      ),
    ).rejects.toThrow(UnauthorizedException);
    expect(add).not.toHaveBeenCalled();
  });
});

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn((_request, _serializer, data) => data),
}));

import { PublishApprovalsController } from '@api/collections/publish-approvals/controllers/publish-approvals.controller';
import type { PublishApprovalsService } from '@api/collections/publish-approvals/services/publish-approvals.service';
import { API_KEY_SCOPES_KEY } from '@api/helpers/guards/api-key/api-key.guard';
import { ApiKeyScope } from '@genfeedai/enums';
import type { Request } from 'express';

describe('PublishApprovalsController', () => {
  it('requires the explicit approval scope for API key callers', () => {
    expect(
      Reflect.getMetadata(
        API_KEY_SCOPES_KEY,
        PublishApprovalsController.prototype.create,
      ),
    ).toEqual([ApiKeyScope.POSTS_APPROVE]);
  });

  it('preserves organization-scoped approval creation', async () => {
    const service = {
      createForPost: vi.fn().mockResolvedValue({ id: 'approval-1' }),
    };
    const controller = new PublishApprovalsController(
      service as unknown as PublishApprovalsService,
    );
    const user = {
      id: 'user-1',
      organizationId: 'org-1',
      userId: 'user-1',
    } as User;

    await controller.create({} as Request, user, { postId: 'post-1' });

    expect(service.createForPost).toHaveBeenCalledWith({
      actorUserId: 'user-1',
      body: { postId: 'post-1' },
      organizationId: 'org-1',
      provenance: { surface: 'publish-approvals-api' },
    });
  });
});

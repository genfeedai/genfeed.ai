import { VideosMergeController } from '@api/collections/videos/controllers/relationships/videos-merge.controller';
import { CreateMergedVideoDto } from '@api/collections/videos/dto/create-video.dto';
import { CREDITS_KEY } from '@api/helpers/decorators/credits/credits.decorator';
import { ROLES_KEY } from '@api/helpers/decorators/roles/roles.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import type { AgentEndpoint } from '@api/services/agent-generation-gateway/agent-endpoint.interface';
import { AgentVideoMergeGatewayService } from '@api/services/agent-generation-gateway/agent-video-merge-gateway.service';
import { testId } from '@helpers/testing/test-id.helper';
import {
  GUARDS_METADATA,
  INTERCEPTORS_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';

const ORGANIZATION_ID = testId('org');
const USER_ID = testId('user');

describe('AgentVideoMergeGatewayService', () => {
  let capturedDescriptor: AgentEndpoint<object, unknown>;
  let mergeVideos: ReturnType<typeof vi.fn>;
  let service: AgentVideoMergeGatewayService;

  beforeEach(async () => {
    mergeVideos = vi.fn().mockResolvedValue({ id: 'merged-1' });
    const invoke = vi.fn((endpoint: AgentEndpoint<object, unknown>) => {
      capturedDescriptor = endpoint;
      return Promise.resolve({});
    });
    service = new AgentVideoMergeGatewayService(
      { invoke } as never,
      { mergeVideos } as never,
    );
    await service.mergeVideos({
      body: {},
      principal: { organizationId: ORGANIZATION_ID, userId: USER_ID },
    });
  });

  const handler = VideosMergeController.prototype.mergeVideos;

  it('validates the body against the DTO the controller binds', () => {
    expect(capturedDescriptor.dto).toBe(CreateMergedVideoDto);
  });

  it('applies RolesGuard on the class iff the controller does, with no handler roles', () => {
    const guards: unknown[] =
      Reflect.getMetadata(GUARDS_METADATA, VideosMergeController) ?? [];
    expect(capturedDescriptor.hasRolesGuard).toBe(guards.includes(RolesGuard));
    expect(capturedDescriptor.requiredRoles).toBeUndefined();
    expect(Reflect.getMetadata(ROLES_KEY, handler)).toBeUndefined();
  });

  it('is not credited, matching the uncredited REST route', () => {
    const interceptors: unknown[] = [
      ...(Reflect.getMetadata(INTERCEPTORS_METADATA, VideosMergeController) ??
        []),
      ...(Reflect.getMetadata(INTERCEPTORS_METADATA, handler) ?? []),
    ];
    expect(Reflect.getMetadata(CREDITS_KEY, handler)).toBeUndefined();
    expect(capturedDescriptor.creditsConfig).toBeUndefined();
    expect(capturedDescriptor.hasCreditsInterceptor).toBe(
      interceptors.includes(CreditsInterceptor),
    );
    expect(capturedDescriptor.hasCreditsInterceptor).toBe(false);
  });

  it('skips the subscription check the controller does not declare', () => {
    const guards: unknown[] =
      Reflect.getMetadata(GUARDS_METADATA, VideosMergeController) ?? [];
    expect(
      guards.map((guard) => (guard as { name: string }).name),
    ).not.toContain('SubscriptionGuard');
    expect(capturedDescriptor.isSubscriptionCheckSkipped).toBe(true);
  });

  it('reports the route the controller mounts', () => {
    const controllerPath = Reflect.getMetadata(
      PATH_METADATA,
      VideosMergeController,
    );
    const methodPath = Reflect.getMetadata(PATH_METADATA, handler);
    expect(capturedDescriptor.originalUrl).toBe(
      `/v1/${controllerPath}/${methodPath}`,
    );
  });

  it('merges as the authenticated principal through the shared orchestration', async () => {
    const user = {
      brandId: 'brand-1',
      id: USER_ID,
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
    };
    const dto = { category: 'video', ids: ['clip-1', 'clip-2'] };

    await capturedDescriptor.handle({ dto, request: {}, user } as never);

    expect(mergeVideos).toHaveBeenCalledWith(user, dto);
  });
});

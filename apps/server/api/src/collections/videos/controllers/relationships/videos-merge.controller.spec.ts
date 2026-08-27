vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn((_request, _serializer, data) => ({ data })),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { VideosMergeController } from '@api/collections/videos/controllers/relationships/videos-merge.controller';
import type { CreateMergedVideoDto } from '@api/collections/videos/dto/create-video.dto';
import type { VideoMergeOrchestrationService } from '@api/collections/videos/services/video-merge-orchestration.service';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { IngredientCategory } from '@genfeedai/enums';
import { IngredientSerializer } from '@genfeedai/serializers';
import type { LoggerService } from '@libs/logger/logger.service';
import type { Request } from 'express';

describe('VideosMergeController', () => {
  const request = { originalUrl: '/api/videos/merge' } as Request;
  const user = {
    id: 'auth-user-id',
    organizationId: 'organization-id',
    userId: 'canonical-user-id',
  } as User;
  const dto = {
    category: IngredientCategory.VIDEO,
    ids: ['video-1', 'video-2'],
  } as CreateMergedVideoDto;
  const loggerService = {
    error: vi.fn(),
    log: vi.fn(),
  } as unknown as LoggerService;
  const videoMergeOrchestrationService = {
    mergeVideos: vi.fn(),
  } as unknown as VideoMergeOrchestrationService;
  const controller = new VideosMergeController(
    loggerService,
    videoMergeOrchestrationService,
  );

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('delegates merge orchestration and preserves the serialized PROCESSING ingredient response', async () => {
    const processingIngredient = { id: 'merged-video', status: 'PROCESSING' };
    vi.mocked(videoMergeOrchestrationService.mergeVideos).mockResolvedValueOnce(
      processingIngredient as never,
    );

    await expect(controller.mergeVideos(request, user, dto)).resolves.toEqual({
      data: processingIngredient,
    });

    expect(videoMergeOrchestrationService.mergeVideos).toHaveBeenCalledWith(
      user,
      dto,
    );
    expect(serializeSingle).toHaveBeenCalledWith(
      request,
      IngredientSerializer,
      processingIngredient,
    );
  });
});

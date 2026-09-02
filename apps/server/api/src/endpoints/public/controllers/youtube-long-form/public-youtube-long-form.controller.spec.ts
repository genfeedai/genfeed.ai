vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn((_request, _serializer, value) => ({ data: value })),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { PublicYoutubeLongFormController } from '@api/endpoints/public/controllers/youtube-long-form/public-youtube-long-form.controller';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { PublicYoutubeLongFormToolSerializer } from '@genfeedai/serializers';
import { IS_PUBLIC_KEY } from '@libs/decorators/public.decorator';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

describe('PublicYoutubeLongFormController', () => {
  const request = { originalUrl: '/youtube-long-form' } as Request;
  const dto = {
    outputType: 'linkedin-article' as const,
    youtubeUrl: 'https://www.youtube.com/watch?v=video_123',
  };
  const user = {
    brandId: 'brand-1',
    id: 'user-fallback',
    organizationId: 'org-1',
    userId: 'user-1',
  } as unknown as User;

  it('serializes the public preview by execution without a durable content id', async () => {
    const workflow = makeWorkflow();
    workflow.runPublic.mockResolvedValue({
      content: 'Body',
      executionId: 'execution-public',
      outputType: dto.outputType,
      summary: 'Summary',
      title: 'Title',
      videoId: 'video_123',
      youtubeUrl: dto.youtubeUrl,
    });
    const controller = new PublicYoutubeLongFormController(workflow as never);

    await controller.create(request, dto);

    expect(workflow.runPublic).toHaveBeenCalledWith(
      dto.youtubeUrl,
      dto.outputType,
    );
    expect(serializeSingle).toHaveBeenCalledWith(
      request,
      PublicYoutubeLongFormToolSerializer,
      expect.objectContaining({
        executionId: 'execution-public',
        id: 'execution-public',
      }),
    );
  });

  it('passes the authenticated tenant identity and serializes the durable content id', async () => {
    const workflow = makeWorkflow();
    workflow.runAuthenticated.mockResolvedValue({
      content: 'Body',
      contentId: 'article-1',
      executionId: 'execution-account',
      outputType: dto.outputType,
      sourceArtifactId: 'artifact-source',
      summary: 'Summary',
      title: 'Title',
      videoId: 'video_123',
      youtubeUrl: dto.youtubeUrl,
    });
    const controller = new PublicYoutubeLongFormController(workflow as never);

    await controller.createAuthenticated(request, user, dto);

    expect(workflow.runAuthenticated).toHaveBeenCalledWith({
      brandId: 'brand-1',
      organizationId: 'org-1',
      outputType: dto.outputType,
      userId: 'user-1',
      youtubeUrl: dto.youtubeUrl,
    });
    expect(serializeSingle).toHaveBeenCalledWith(
      request,
      PublicYoutubeLongFormToolSerializer,
      expect.objectContaining({
        id: 'article-1',
        sourceArtifactId: 'artifact-source',
      }),
    );
  });

  it('promotes only the authenticated artifact capability', async () => {
    const workflow = makeWorkflow();
    workflow.promoteSourceToLibrary.mockResolvedValue({
      artifactId: 'artifact-source',
      ingredientId: 'ingredient-1',
      status: 'linked',
    });
    const controller = new PublicYoutubeLongFormController(workflow as never);

    await controller.promoteSource(request, user, 'artifact-source');

    expect(workflow.promoteSourceToLibrary).toHaveBeenCalledWith({
      artifactId: 'artifact-source',
      organizationId: 'org-1',
      userId: 'user-1',
    });
  });

  it('marks only the free preview handler as public', () => {
    expect(
      Reflect.getMetadata(
        IS_PUBLIC_KEY,
        PublicYoutubeLongFormController.prototype.create,
      ),
    ).toBe(true);
    expect(
      Reflect.getMetadata(
        IS_PUBLIC_KEY,
        PublicYoutubeLongFormController.prototype.createAuthenticated,
      ),
    ).not.toBe(true);
    expect(
      Reflect.getMetadata(
        IS_PUBLIC_KEY,
        PublicYoutubeLongFormController.prototype.promoteSource,
      ),
    ).not.toBe(true);
  });
});

function makeWorkflow(): {
  promoteSourceToLibrary: ReturnType<typeof vi.fn>;
  runAuthenticated: ReturnType<typeof vi.fn>;
  runPublic: ReturnType<typeof vi.fn>;
} {
  return {
    promoteSourceToLibrary: vi.fn(),
    runAuthenticated: vi.fn(),
    runPublic: vi.fn(),
  };
}

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn((_request, serializer, value) => ({
    data: value,
    serializer,
  })),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { YoutubeLongFormWorkflowService } from '@api/collections/workflows/services/youtube-long-form-workflow.service';
import { PublicYoutubeLongFormController } from '@api/endpoints/public/controllers/youtube-long-form/public-youtube-long-form.controller';
import {
  IngredientSerializer,
  PublicYoutubeLongFormToolSerializer,
} from '@genfeedai/serializers';
import { IS_PUBLIC_KEY } from '@libs/decorators/public.decorator';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

const dto = {
  outputType: 'linkedin-article' as const,
  youtubeUrl: 'https://www.youtube.com/watch?v=video_123',
};

/**
 * The long-form workflow: public runs return only an execution, account runs
 * persist an article for the tenant they ran as, and promotion links a source
 * artifact the organization owns into its library.
 */
function buildController() {
  const accountRuns: Record<string, unknown>[] = [];
  const workflow = {
    promoteSourceToLibrary: async (input: {
      artifactId: string;
      organizationId: string;
      userId: string;
    }) => {
      if (
        input.artifactId !== 'artifact-source' ||
        input.organizationId !== 'org-1'
      ) {
        throw new Error('Source artifact not found');
      }
      return {
        artifactId: input.artifactId,
        ingredientId: `ingredient-for-${input.userId}`,
        status: 'linked',
      };
    },
    runAuthenticated: async (input: Record<string, unknown>) => {
      accountRuns.push(input);
      return {
        content: 'Body',
        contentId: 'article-1',
        executionId: 'execution-account',
        outputType: input.outputType,
        sourceArtifactId: 'artifact-source',
        summary: 'Summary',
        title: 'Title',
        videoId: 'video_123',
        youtubeUrl: input.youtubeUrl,
      };
    },
    runPublic: async (youtubeUrl: string, outputType: string) => ({
      content: 'Body',
      executionId: 'execution-public',
      outputType,
      summary: 'Summary',
      title: 'Title',
      videoId: 'video_123',
      youtubeUrl,
    }),
  };
  return {
    accountRuns,
    controller: new PublicYoutubeLongFormController(
      workflow as unknown as YoutubeLongFormWorkflowService,
    ),
  };
}

describe('PublicYoutubeLongFormController', () => {
  const request = { originalUrl: '/youtube-long-form' } as Request;
  const user = {
    brandId: 'brand-1',
    id: 'user-fallback',
    organizationId: 'org-1',
    userId: 'user-1',
  } as unknown as User;

  it('serializes the public preview by execution without a durable content id', async () => {
    const { controller } = buildController();

    await expect(controller.create(request, dto)).resolves.toEqual({
      data: expect.objectContaining({
        executionId: 'execution-public',
        id: 'execution-public',
        outputType: dto.outputType,
        youtubeUrl: dto.youtubeUrl,
      }),
      serializer: PublicYoutubeLongFormToolSerializer,
    });
  });

  it('runs as the authenticated tenant and serializes the durable content id', async () => {
    const { accountRuns, controller } = buildController();

    await expect(
      controller.createAuthenticated(request, user, dto),
    ).resolves.toEqual({
      data: expect.objectContaining({
        id: 'article-1',
        sourceArtifactId: 'artifact-source',
      }),
      serializer: PublicYoutubeLongFormToolSerializer,
    });
    expect(accountRuns).toEqual([
      {
        brandId: 'brand-1',
        organizationId: 'org-1',
        outputType: dto.outputType,
        userId: 'user-1',
        youtubeUrl: dto.youtubeUrl,
      },
    ]);
  });

  it('promotes the source artifact as the authenticated user of its organization', async () => {
    const { controller } = buildController();

    await expect(
      controller.promoteSource(request, user, 'artifact-source'),
    ).resolves.toEqual({
      data: { id: 'ingredient-for-user-1' },
      serializer: IngredientSerializer,
    });
    await expect(
      controller.promoteSource(
        request,
        { ...user, organizationId: 'org-2' } as User,
        'artifact-source',
      ),
    ).rejects.toThrow('not found');
  });

  it.each([
    ['create', true],
    ['createAuthenticated', undefined],
    ['promoteSource', undefined],
  ] as const)('marks %s public: %s', (handler, expected) => {
    expect(
      Reflect.getMetadata(
        IS_PUBLIC_KEY,
        PublicYoutubeLongFormController.prototype[handler],
      ),
    ).toBe(expected);
  });
});

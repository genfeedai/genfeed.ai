import { PostsAccountGenerationRetryController } from '@api/collections/posts/controllers/operations/posts-account-generation-retry.controller';
import { PostGenerationService } from '@api/collections/posts/services/post-generation.service';
import { ORGANIZATION_MODULE_KEY } from '@api/common/organization-modules/organization-module.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/collections/templates/services/templates.service', () => ({
  TemplatesService: class {},
}));
vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn((_req, _serializer, data) => ({ data })),
}));

describe('PostsAccountGenerationRetryController', () => {
  const retry = vi.fn();
  const user = {
    brandId: 'brand-1',
    organizationId: 'org-1',
    userId: 'user-1',
  };
  const requestKey = '7b1f6a3e-2c54-4d0e-9a8b-3f1c2d4e5a60';
  let controller: PostsAccountGenerationRetryController;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [PostsAccountGenerationRetryController],
      providers: [
        {
          provide: PostGenerationService,
          useValue: { retryAccountContentGeneration: retry },
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(PostsAccountGenerationRetryController);
  });

  it('retries the failed placeholder under the caller-supplied request key', async () => {
    retry.mockResolvedValueOnce({ id: 'post-1' });

    const result = await controller.retryAccountGeneration(
      {} as Request,
      'post-1',
      { requestKey },
      user as never,
    );

    expect(retry).toHaveBeenCalledWith('post-1', requestKey, user);
    expect(result).toEqual({ data: { id: 'post-1' } });
  });

  it('is POST /posts/:postId/generation-retries behind the publishing module', () => {
    const handler =
      PostsAccountGenerationRetryController.prototype.retryAccountGeneration;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      ':postId/generation-retries',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.POST,
    );
    expect(
      Reflect.getMetadata(
        ORGANIZATION_MODULE_KEY,
        PostsAccountGenerationRetryController,
      ),
    ).toEqual({ moduleId: 'publishing', operation: undefined });
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        PostsAccountGenerationRetryController,
      ),
    ).toContain(RolesGuard);
  });
});

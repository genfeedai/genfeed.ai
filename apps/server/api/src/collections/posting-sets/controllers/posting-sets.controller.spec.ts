import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { PostingSetsController } from '@api/collections/posting-sets/controllers/posting-sets.controller';
import type { CreatePostingSetDto } from '@api/collections/posting-sets/dto/create-posting-set.dto';
import type { PostingSetsQueryDto } from '@api/collections/posting-sets/dto/posting-sets-query.dto';
import type { UpdatePostingSetDto } from '@api/collections/posting-sets/dto/update-posting-set.dto';
import type { PostingSetsService } from '@api/collections/posting-sets/services/posting-sets.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { API_KEY_SCOPES_KEY } from '@api/helpers/guards/api-key/api-key.guard';
import { ApiKeyScope } from '@genfeedai/contracts';
import type { IPostingSetScope } from '@genfeedai/contracts/interfaces';
import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: (
    _request: unknown,
    _serializer: unknown,
    data: unknown,
  ) => ({
    data,
  }),
  serializeSingle: (
    _request: unknown,
    _serializer: unknown,
    data: unknown,
  ) => ({
    data,
  }),
}));

interface StoredPostingSet extends IPostingSetScope {
  id: string;
  label: string;
  targets: Array<{ credentialId: string; targetKey: string }>;
}

describe('PostingSetsController', () => {
  const request = {} as Request;
  const user = {
    brandId: 'brand-1',
    id: 'user-1',
    isSuperAdmin: false,
    organizationId: 'org-1',
    userId: 'user-1',
  } as unknown as User;
  const query = { brandId: 'brand-1' } as PostingSetsQueryDto;
  const body = {
    label: 'Launch channels',
    targets: [{ credentialId: 'cred_x', targetKey: 'x-primary' }],
  } as unknown as CreatePostingSetDto;

  let postingSets: StoredPostingSet[];
  let controller: PostingSetsController;

  beforeEach(() => {
    postingSets = [];

    const inScope = (id: string, scope: IPostingSetScope) => {
      const found = postingSets.find(
        (set) =>
          set.id === id &&
          set.organizationId === scope.organizationId &&
          set.brandId === scope.brandId,
      );
      if (!found) {
        throw new NotFoundException('Posting set', id);
      }
      return found;
    };
    const service = {
      createScoped: async (
        input: { label: string; targets: StoredPostingSet['targets'] },
        scope: IPostingSetScope,
      ) => {
        const created = {
          ...input,
          ...scope,
          id: `set-${postingSets.length + 1}`,
        };
        postingSets.push(created);
        return created;
      },
      expandScoped: async (
        id: string,
        _input: unknown,
        scope: IPostingSetScope,
      ) => inScope(id, scope).targets,
      findAllScoped: async (scope: IPostingSetScope) =>
        postingSets.filter(
          (set) => set.organizationId === scope.organizationId,
        ),
      findOneScoped: async (id: string, scope: IPostingSetScope) =>
        inScope(id, scope),
      removeScoped: async (id: string, scope: IPostingSetScope) => {
        const target = inScope(id, scope);
        postingSets = postingSets.filter((set) => set !== target);
      },
      updateScoped: async (
        id: string,
        input: { label?: string },
        scope: IPostingSetScope,
      ) => Object.assign(inScope(id, scope), input),
    };

    controller = new PostingSetsController(
      service as unknown as PostingSetsService,
    );
  });

  it('stamps the caller tenant scope onto a created set', async () => {
    await expect(controller.create(request, user, body)).resolves.toEqual({
      data: {
        brandId: 'brand-1',
        id: 'set-1',
        label: 'Launch channels',
        organizationId: 'org-1',
        targets: [{ credentialId: 'cred_x', targetKey: 'x-primary' }],
        userId: 'user-1',
      },
    });
  });

  it('reads, updates, expands and removes a set inside the tenant scope', async () => {
    await controller.create(request, user, body);

    await expect(
      controller.findOne(request, user, query, 'set-1'),
    ).resolves.toMatchObject({ data: { id: 'set-1' } });
    await expect(
      controller.update(request, user, query, 'set-1', {
        label: 'Updated',
      } as UpdatePostingSetDto),
    ).resolves.toMatchObject({ data: { label: 'Updated' } });
    await expect(controller.expand(user, query, 'set-1', {})).resolves.toEqual({
      targets: [{ credentialId: 'cred_x', targetKey: 'x-primary' }],
    });
    await expect(controller.remove(user, query, 'set-1')).resolves.toEqual({
      success: true,
    });

    expect(postingSets).toEqual([]);
  });

  it('rejects a cross-tenant organization override before mutation', async () => {
    await controller.create(request, user, body);

    await expect(
      controller.update(
        request,
        user,
        { organizationId: 'org-2' } as PostingSetsQueryDto,
        'set-1',
        { label: 'Hijacked' } as UpdatePostingSetDto,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(postingSets[0]?.label).toBe('Launch channels');
  });

  it('rejects a request without a user context', async () => {
    await expect(
      controller.create(
        request,
        { organizationId: 'org-1' } as unknown as User,
        body,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(postingSets).toEqual([]);
  });

  it.each([
    ['create', PostingSetsController.prototype.create],
    ['update', PostingSetsController.prototype.update],
    ['remove', PostingSetsController.prototype.remove],
    ['expand', PostingSetsController.prototype.expand],
  ])('declares posting write scopes on %s', (_label, handler) => {
    expect(Reflect.getMetadata(API_KEY_SCOPES_KEY, handler)).toEqual([
      ApiKeyScope.POSTS_DRAFT,
      ApiKeyScope.POSTS_SCHEDULE,
    ]);
  });
});

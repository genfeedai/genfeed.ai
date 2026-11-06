import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { PostingSignaturesController } from '@api/collections/posting-sets/controllers/posting-signatures.controller';
import type { CreatePostingSignatureDto } from '@api/collections/posting-sets/dto/create-posting-signature.dto';
import type { PostingSignaturesQueryDto } from '@api/collections/posting-sets/dto/posting-signatures-query.dto';
import type { UpdatePostingSignatureDto } from '@api/collections/posting-sets/dto/update-posting-signature.dto';
import type { PostingSignaturesService } from '@api/collections/posting-sets/services/posting-signatures.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { API_KEY_SCOPES_KEY } from '@api/helpers/guards/api-key/api-key.guard';
import { ApiKeyScope, CredentialPlatform } from '@genfeedai/contracts';
import type { IPostingSetScope } from '@genfeedai/contracts/interfaces';
import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';

vi.mock('@genfeedai/serializers', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@genfeedai/serializers')>();
  return {
    ...actual,
    PostingSignatureSerializer: { serialize: vi.fn() },
  };
});

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn(
    (_request: unknown, _serializer: unknown, data: unknown) => ({ data }),
  ),
  serializeSingle: vi.fn(
    (_request: unknown, _serializer: unknown, data: unknown) => ({ data }),
  ),
}));

type Signature = Record<string, unknown> & { id: string };

const inScope = (row: Signature, scope: IPostingSetScope) =>
  !row.isDeleted &&
  row.organizationId === scope.organizationId &&
  row.brandId === scope.brandId;

/** Posting signatures stored per tenant scope, as the scoped service keeps them. */
function createSignatures(rows: Signature[]) {
  const findScoped = (id: string, scope: IPostingSetScope) => {
    const row = rows.find((item) => item.id === id && inScope(item, scope));
    if (!row) throw new NotFoundException('Posting signature', id);
    return row;
  };
  return {
    createScoped: async (
      body: Record<string, unknown>,
      scope: IPostingSetScope,
    ) => {
      const row = {
        ...body,
        ...scope,
        id: `sig-${rows.length + 1}`,
        isDeleted: false,
      };
      rows.push(row);
      return row;
    },
    findAllScoped: async (scope: IPostingSetScope) =>
      rows.filter((row) => inScope(row, scope)),
    findOneScoped: async (id: string, scope: IPostingSetScope) =>
      findScoped(id, scope),
    removeScoped: async (id: string, scope: IPostingSetScope) => {
      findScoped(id, scope).isDeleted = true;
    },
    updateScoped: async (
      id: string,
      body: Record<string, unknown>,
      scope: IPostingSetScope,
    ) => Object.assign(findScoped(id, scope), body),
  };
}

describe('PostingSignaturesController', () => {
  const request = {} as Request;
  const user = {
    brandId: 'brand-1',
    id: 'user-1',
    isSuperAdmin: false,
    organizationId: 'org-1',
    userId: 'user-1',
  } as unknown as User;
  const brandQuery = { brandId: 'brand-1' } as PostingSignaturesQueryDto;
  let rows: Signature[];
  let controller: PostingSignaturesController;

  beforeEach(() => {
    rows = [
      {
        brandId: 'brand-1',
        id: 'sig-own',
        isDeleted: false,
        label: 'X footer',
        organizationId: 'org-1',
      },
      {
        brandId: 'brand-2',
        id: 'sig-foreign',
        isDeleted: false,
        label: 'Other footer',
        organizationId: 'org-2',
      },
    ];
    controller = new PostingSignaturesController(
      createSignatures(rows) as unknown as PostingSignaturesService,
    );
  });

  it('stamps tenant scope onto signature create', async () => {
    const body = {
      body: 'Built with Genfeed.',
      label: 'X footer',
      platforms: [CredentialPlatform.TWITTER],
    } as CreatePostingSignatureDto;

    const response = await controller.create(request, user, body);

    expect(response).toEqual({
      data: expect.objectContaining({
        body: 'Built with Genfeed.',
        brandId: 'brand-1',
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    });
    expect(rows).toHaveLength(3);
  });

  it('rejects a cross-tenant organization override before mutation', async () => {
    await expect(
      controller.update(
        request,
        user,
        { organizationId: 'org-2' } as PostingSignaturesQueryDto,
        'sig-foreign',
        { label: 'Hijacked' } as UpdatePostingSignatureDto,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(rows[1].label).toBe('Other footer');
  });

  it.each([
    ['create', PostingSignaturesController.prototype.create],
    ['update', PostingSignaturesController.prototype.update],
    ['remove', PostingSignaturesController.prototype.remove],
  ])('declares posting write scopes on %s', (_name, handler) => {
    expect(Reflect.getMetadata(API_KEY_SCOPES_KEY, handler)).toEqual([
      ApiKeyScope.POSTS_DRAFT,
      ApiKeyScope.POSTS_SCHEDULE,
    ]);
  });

  it('reads and removes only signatures in the caller scope', async () => {
    await expect(
      controller.findOne(request, user, brandQuery, 'sig-own'),
    ).resolves.toEqual({ data: expect.objectContaining({ id: 'sig-own' }) });
    await expect(
      controller.findOne(request, user, brandQuery, 'sig-foreign'),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      controller.remove(user, brandQuery, 'sig-own'),
    ).resolves.toEqual({ success: true });

    expect(rows.map((row) => row.isDeleted)).toEqual([true, false]);
    await expect(
      controller.findOne(request, user, brandQuery, 'sig-own'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

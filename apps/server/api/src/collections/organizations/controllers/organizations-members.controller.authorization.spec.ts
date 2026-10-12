import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import type { UpdateMemberDto } from '@api/collections/members/dto/update-member.dto';
import { InvitationService } from '@api/collections/members/services/invitation.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationsMembersController } from '@api/collections/organizations/controllers/organizations-members.controller';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { MemberCreditsGuard } from '@api/helpers/guards/member-credits/member-credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { brandAccessFixture } from '@api/shared/testing/brand-access.fixture';
import { ApiKeyScope, MemberRole } from '@genfeedai/contracts';
import { MemberSerializer } from '@genfeedai/serializers';
import { testId } from '@helpers/testing/test-id.helper';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, type INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';

const organizationId = testId('org');
const userId = testId('user');
const ownMemberId = testId('member');
const otherMemberId = testId('member', 2);
const brandId = testId('brand');
const roleId = testId('role');
const mutations: [string, UpdateMemberDto][] = [
  ['brandIds', { brandIds: [brandId] }],
  ['roleId', { roleId }],
  ['isActive', { isActive: false }],
  ['isDeleted', { isDeleted: true }],
];

// Authentication supplies a principal; the actual controller metadata and
// RolesGuard decide authorization before any management-handler lookup.
describe('Organization member mutations (real HTTP role guard)', () => {
  let app: INestApplication;
  let principal: AuthenticatedUser;
  let actorRole: MemberRole;
  let membership: { isActive: boolean; isDeleted: boolean } | null;
  let targetRoleKey: string;
  let nextRoleKey: string;
  const members = {
    findMembershipRoleKey: vi.fn(),
    findOne: vi.fn(),
    patch: vi.fn(),
    resolveRoleAssignment: vi.fn(),
  };
  const invitations = { createInvitation: vi.fn() };
  const organizations = { findOne: vi.fn() };
  const brands = { findAll: vi.fn() };

  beforeAll(async () => {
    vi.spyOn(MemberSerializer, 'serialize').mockReturnValue({
      data: {
        attributes: { organizationId },
        id: otherMemberId,
        type: 'member',
      },
    });
    const moduleRef = await Test.createTestingModule({
      controllers: [OrganizationsMembersController],
      providers: [
        { provide: BrandAccessService, useValue: brandAccessFixture() },
        RolesGuard,
        Reflector,
        { provide: MembersService, useValue: members },
        { provide: OrganizationsService, useValue: organizations },
        { provide: BrandsService, useValue: brands },
        { provide: InvitationService, useValue: invitations },
        { provide: ConfigService, useValue: { get: vi.fn() } },
        {
          provide: LoggerService,
          useValue: { log: vi.fn(), error: vi.fn() },
        },
      ],
    })
      // Only the invitation route carries the billing guard.
      .overrideGuard(MemberCreditsGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { user: AuthenticatedUser }).user = principal;
      next();
    });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    principal = { id: userId, userId, organizationId, brandId };
    actorRole = MemberRole.ADMIN;
    membership = { isActive: true, isDeleted: false };
    members.findOne.mockImplementation(
      async (query: Record<string, unknown>) => {
        if ('userId' in query) {
          if (
            !membership ||
            query.userId !== userId ||
            query.organizationId !== organizationId ||
            query.isActive !== membership.isActive ||
            query.isDeleted !== membership.isDeleted
          ) {
            return null;
          }
          return { id: ownMemberId, ...membership, role: { key: actorRole } };
        }
        return { id: query.id, organizationId };
      },
    );
    targetRoleKey = MemberRole.USER;
    nextRoleKey = MemberRole.USER;
    members.findMembershipRoleKey.mockImplementation(
      async (_orgId: string, where: { id?: string; userId?: string }) =>
        where.userId ? actorRole : targetRoleKey,
    );
    members.resolveRoleAssignment.mockImplementation(async (id: string) => ({
      roleId: id,
      roleKey: nextRoleKey,
    }));
    members.patch.mockResolvedValue({ id: otherMemberId, organizationId });
    invitations.createInvitation.mockResolvedValue({ id: testId('invite') });
    organizations.findOne.mockResolvedValue({ id: organizationId });
    brands.findAll.mockResolvedValue({ docs: [{ id: brandId }] });
  });

  function patchMember(
    memberId: string,
    body: UpdateMemberDto,
    orgId = organizationId,
  ) {
    return request(app.getHttpServer())
      .patch(`/organizations/${orgId}/members/${memberId}`)
      .send(body);
  }

  function expectHandlerUntouched() {
    expect(organizations.findOne).not.toHaveBeenCalled();
    expect(brands.findAll).not.toHaveBeenCalled();
    expect(members.patch).not.toHaveBeenCalled();
    expect(
      members.findOne.mock.calls.every(([query]) => 'userId' in query),
    ).toBe(true);
  }

  function expectActorLookup() {
    expect(members.findOne).toHaveBeenCalledTimes(1);
    expect(members.findOne).toHaveBeenCalledWith(
      { isActive: true, isDeleted: false, organizationId, userId },
      expect.any(Array),
    );
  }

  describe.each([
    MemberRole.USER,
    MemberRole.CREATOR,
    MemberRole.ANALYTICS,
    MemberRole.SUPPORT,
  ])('ordinary %s member', (role) => {
    describe.each([
      ['self', ownMemberId],
      ['other', otherMemberId],
    ])('%s target', (_target, memberId) => {
      it.each(mutations)(
        'denies %s before target lookup or mutation',
        async (_field, body) => {
          actorRole = role;
          const response = await patchMember(memberId, body).expect(403);
          expectActorLookup();
          expectHandlerUntouched();
          expect(JSON.stringify(response.body)).not.toContain(memberId);
          expect(JSON.stringify(response.body)).not.toContain(brandId);
        },
      );
    });
  });

  describe.each([MemberRole.OWNER, MemberRole.ADMIN])('%s manager', (role) => {
    it('allows an active session to update same-org brand assignments', async () => {
      actorRole = role;
      await patchMember(otherMemberId, { brandIds: [brandId] }).expect(200);
      expect(members.findOne).toHaveBeenCalledWith({
        id: otherMemberId,
        organizationId,
      });
      expect(brands.findAll).toHaveBeenCalledWith(
        { where: { id: { in: [brandId] }, isDeleted: false, organizationId } },
        expect.objectContaining({ pagination: false }),
      );
      expect(members.patch).toHaveBeenCalledWith(otherMemberId, {
        brandIds: [brandId],
      });
    });

    it.each([
      { scopes: [] },
      { scopes: [ApiKeyScope.VIDEOS_READ] },
      { scopes: ['*'] },
    ])('denies an API key capped by scopes $scopes', async ({ scopes }) => {
      actorRole = role;
      principal = { ...principal, isApiKey: true, scopes };
      await patchMember(ownMemberId, { roleId }).expect(403);
      expectActorLookup();
      expectHandlerUntouched();
    });

    it('allows an explicitly admin-scoped API key', async () => {
      actorRole = role;
      principal = { ...principal, isApiKey: true, scopes: [ApiKeyScope.ADMIN] };
      await patchMember(otherMemberId, { roleId }).expect(200);
      expect(members.patch).toHaveBeenCalledWith(otherMemberId, { roleId });
    });
  });

  it.each([
    ['missing', null],
    ['inactive', { isActive: false, isDeleted: false }],
    ['deleted', { isActive: true, isDeleted: true }],
  ] as const)('denies %s actor membership', async (_state, actorMembership) => {
    membership = actorMembership;
    await patchMember(otherMemberId, { isDeleted: true }).expect(403);
    expectActorLookup();
    expectHandlerUntouched();
  });

  it('rejects an authorized manager targeting a different organization', async () => {
    await patchMember(otherMemberId, { roleId }, testId('org', 2)).expect(403);
    expect(members.findOne).not.toHaveBeenCalled();
    expectHandlerUntouched();
  });

  it('preserves missing target membership rejection for an authorized manager', async () => {
    members.findOne
      .mockResolvedValueOnce({
        id: ownMemberId,
        role: { key: MemberRole.ADMIN },
      })
      .mockResolvedValueOnce(null);
    await patchMember(otherMemberId, { roleId }).expect(404);
    expect(members.findOne).toHaveBeenCalledWith({
      id: otherMemberId,
      organizationId,
    });
    expect(members.patch).not.toHaveBeenCalled();
  });

  describe('owner membership', () => {
    it.each(mutations.filter(([field]) => field !== 'brandIds'))(
      'denies an admin changing an owner %s',
      async (_field, body) => {
        targetRoleKey = MemberRole.OWNER;
        await patchMember(otherMemberId, body).expect(403);
        expect(members.patch).not.toHaveBeenCalled();
      },
    );

    it('denies an admin granting the owner role, to themselves or others', async () => {
      nextRoleKey = MemberRole.OWNER;
      await patchMember(ownMemberId, { roleId }).expect(403);
      await patchMember(otherMemberId, { roleId }).expect(403);
      expect(members.patch).not.toHaveBeenCalled();
    });

    it('denies an admin-scoped API key of an admin granting the owner role', async () => {
      principal = { ...principal, isApiKey: true, scopes: [ApiKeyScope.ADMIN] };
      nextRoleKey = MemberRole.OWNER;
      await patchMember(otherMemberId, { roleId }).expect(403);
      expect(members.patch).not.toHaveBeenCalled();
    });

    it('denies an admin restoring a soft-deleted owner', async () => {
      targetRoleKey = MemberRole.OWNER;
      await patchMember(otherMemberId, { isDeleted: false }).expect(403);
      expect(members.findMembershipRoleKey).toHaveBeenCalledWith(
        organizationId,
        { id: otherMemberId },
      );
      expect(members.findMembershipRoleKey).toHaveBeenCalledWith(
        organizationId,
        { isActive: true, isDeleted: false, userId },
      );
      expect(members.patch).not.toHaveBeenCalled();
    });

    it('still lets an admin assign brands to an owner', async () => {
      targetRoleKey = MemberRole.OWNER;
      await patchMember(otherMemberId, { brandIds: [brandId] }).expect(200);
      expect(members.findMembershipRoleKey).not.toHaveBeenCalled();
      expect(members.patch).toHaveBeenCalled();
    });

    it('lets an owner grant the owner role and change another owner', async () => {
      actorRole = MemberRole.OWNER;
      targetRoleKey = MemberRole.OWNER;
      nextRoleKey = MemberRole.OWNER;
      await patchMember(otherMemberId, { roleId }).expect(200);
      await patchMember(otherMemberId, { isActive: false }).expect(200);
      expect(members.patch).toHaveBeenCalledTimes(2);
    });

    it('rejects an unknown role before any write', async () => {
      members.resolveRoleAssignment.mockRejectedValueOnce(
        new BadRequestException('Role not found'),
      );
      await patchMember(otherMemberId, { roleId }).expect(400);
      expect(members.patch).not.toHaveBeenCalled();
    });

    it('denies an admin inviting someone as owner', async () => {
      nextRoleKey = MemberRole.OWNER;
      await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/members`)
        .send({ email: 'new@example.com', roleId })
        .expect(403);
      expect(invitations.createInvitation).not.toHaveBeenCalled();
    });

    it('lets an owner invite someone as owner', async () => {
      actorRole = MemberRole.OWNER;
      nextRoleKey = MemberRole.OWNER;
      await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/members`)
        .send({ email: 'new@example.com', roleId })
        .expect(201);
      expect(invitations.createInvitation).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId, roleId }),
      );
    });
  });

  it('rejects a foreign brand assignment without mutation', async () => {
    const foreignBrandId = testId('brand', 2);
    brands.findAll.mockResolvedValue({ docs: [] });
    await patchMember(otherMemberId, { brandIds: [foreignBrandId] }).expect(
      400,
    );
    expect(brands.findAll).toHaveBeenCalledWith(
      {
        where: {
          id: { in: [foreignBrandId] },
          isDeleted: false,
          organizationId,
        },
      },
      expect.objectContaining({ pagination: false }),
    );
    expect(members.patch).not.toHaveBeenCalled();
  });
});

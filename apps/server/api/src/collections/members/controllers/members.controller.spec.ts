// Stub only the serializer hop — `returnNotFound` stays real so the 404
// convention this suite asserts is the production one, not a test double.
vi.mock(
  '@api/helpers/utils/response/response.util',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@api/helpers/utils/response/response.util')
    >()),
    serializeSingle: vi.fn((_req, _serializer, data) => data),
  }),
);

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { MembersController } from '@api/collections/members/controllers/members.controller';
import type { InvitationService } from '@api/collections/members/services/invitation.service';
import type { MembersService } from '@api/collections/members/services/members.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import type { Request } from 'express';

const callerOrgId = 'clr1a2b3c4d5e6f7g8h9i0jk';
const otherOrgId = 'clr9z8y7x6w5v4u3t2s1r0qp';
const callerUserId = 'clu1a2b3c4d5e6f7g8h9i0jk';
// A member of the caller's own organization.
const memberId = 'clm1a2b3c4d5e6f7g8h9i0jk';
// A real, well-formed member id that belongs to `otherOrgId`.
const foreignMemberId = 'clm9z8y7x6w5v4u3t2s1r0qp';

const makeUser = (overrides: Record<string, unknown> = {}): User =>
  ({
    id: 'authProvider-user-1',
    publicMetadata: {
      brand: '',
      isSuperAdmin: false,
      organization: callerOrgId,
      user: callerUserId,
      ...overrides,
    },
  }) as unknown as User;

const makeRequest = (): Request =>
  ({ originalUrl: `/members/${memberId}` }) as unknown as Request;

const mockMembersService = {
  findAll: vi.fn(),
  findOne: vi.fn(),
} as unknown as MembersService;

const mockInvitationService = {
  listInvitations: vi.fn(),
  resendInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
} as unknown as InvitationService;

const mockLoggerService = {
  debug: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
} as unknown as LoggerService;

function buildController() {
  return new MembersController(
    mockMembersService,
    mockInvitationService,
    mockLoggerService,
  );
}

async function expectNotFound(promise: Promise<unknown>): Promise<void> {
  await expect(promise).rejects.toThrow(HttpException);
  await promise.catch((error: HttpException) => {
    expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
  });
}

describe('MembersController.findOne — cross-tenant scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scopes the lookup to the caller organization and excludes soft-deleted rows', async () => {
    const controller = buildController();
    vi.mocked(mockMembersService.findOne).mockResolvedValue({
      id: memberId,
      isActive: true,
      isDeleted: false,
      organizationId: callerOrgId,
      userId: callerUserId,
    } as never);

    await controller.findOne(makeRequest(), makeUser(), memberId);

    expect(mockMembersService.findOne).toHaveBeenCalledWith({
      _id: memberId,
      isDeleted: false,
      organizationId: callerOrgId,
    });
  });

  it('returns 404 for a member id belonging to another organization', async () => {
    const controller = buildController();
    // `foreignMemberId` exists, but in `otherOrgId`. The caller's org-scoped
    // filter matches nothing, so the service resolves null and the controller
    // must 404 — never leak the foreign roster row, and never report 403,
    // which would confirm the id exists elsewhere.
    vi.mocked(mockMembersService.findOne).mockResolvedValue(null);

    await expectNotFound(
      controller.findOne(makeRequest(), makeUser(), foreignMemberId),
    );

    expect(mockMembersService.findOne).toHaveBeenCalledWith({
      _id: foreignMemberId,
      isDeleted: false,
      organizationId: callerOrgId,
    });
    expect(mockMembersService.findOne).not.toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: otherOrgId }),
    );
  });

  it('never issues an unscoped read when the session carries no organization', async () => {
    const controller = buildController();

    await expectNotFound(
      controller.findOne(
        makeRequest(),
        makeUser({ organization: '' }),
        memberId,
      ),
    );

    expect(mockMembersService.findOne).not.toHaveBeenCalled();
  });

  it('returns 404 for a malformed member id without querying', async () => {
    const controller = buildController();

    await expectNotFound(
      controller.findOne(makeRequest(), makeUser(), 'not-an-entity-id'),
    );

    expect(mockMembersService.findOne).not.toHaveBeenCalled();
  });
});

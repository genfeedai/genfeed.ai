import { SocialInboxController } from '@api/collections/social-inbox/controllers/social-inbox.controller';
import { SocialInboxQueryDto } from '@api/collections/social-inbox/dto/social-inbox-query.dto';
import {
  adminUser,
  emptyPage,
  fieldValues,
  memberUser,
  sessionBrandId,
  sessionOrganizationId,
  targetOrganizationId,
  tenantReadQuery,
  tenantReadRequest,
} from '@api-test/helpers/tenant-read.fixture';
import { ForbiddenException } from '@nestjs/common';

describe('SocialInboxController tenant reads (#6176)', () => {
  function setup() {
    const mock = vi.fn().mockResolvedValue(emptyPage());
    const controller = Object.create(
      SocialInboxController.prototype,
    ) as SocialInboxController;
    Object.assign(controller, {
      socialInboxService: { listConversations: mock },
      loggerService: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });
    return { controller, mock };
  }

  it('uses the target organization for a verified superadmin override', async () => {
    const { controller, mock } = setup();
    const user = adminUser;
    const query = tenantReadQuery(SocialInboxQueryDto, {
      organizationId: targetOrganizationId,
    });
    const request = tenantReadRequest(user, query);
    await controller.listConversations(request, user, query);
    const read = mock.mock.calls[0]?.[0];
    expect(fieldValues(read, 'organizationId')).toContain(targetOrganizationId);
    expect(fieldValues(read, 'organizationId')).not.toContain(
      sessionOrganizationId,
    );
    expect(fieldValues(read, 'isDeleted')).not.toContain(true);
    expect(fieldValues(read, 'brandId')).not.toContain(sessionBrandId);
  });

  it('rejects a member foreign organization before reading', async () => {
    const { controller, mock } = setup();
    const user = memberUser;
    const query = tenantReadQuery(SocialInboxQueryDto, {
      organizationId: targetOrganizationId,
    });
    const request = tenantReadRequest(user, query);
    await expect(
      controller.listConversations(request, user, query),
    ).rejects.toThrow(ForbiddenException);
    expect(mock).not.toHaveBeenCalled();
  });

  it('keeps the session organization for a member without an override', async () => {
    const { controller, mock } = setup();
    const user = memberUser;
    const query = tenantReadQuery(SocialInboxQueryDto, {});
    const request = tenantReadRequest(user);
    await controller.listConversations(request, user, query);
    expect(fieldValues(mock.mock.calls[0]?.[0], 'organizationId')).toContain(
      sessionOrganizationId,
    );
    expect(
      fieldValues(mock.mock.calls[0]?.[0], 'organizationId'),
    ).not.toContain(targetOrganizationId);
    expect(fieldValues(mock.mock.calls[0]?.[0], 'isDeleted')).not.toContain(
      true,
    );
  });
});

describe('SocialInboxController.countUnreadConversations tenant reads (#6176)', () => {
  function setup() {
    const mock = vi
      .fn()
      .mockResolvedValue({ id: 'unread-count', unreadCount: 0 });
    const controller = Object.create(
      SocialInboxController.prototype,
    ) as SocialInboxController;
    Object.assign(controller, {
      socialInboxService: { countUnreadConversations: mock },
    });
    return { controller, mock };
  }
  it('uses the target organization for a superadmin', async () => {
    const { controller, mock } = setup();
    const user = adminUser;
    const query = tenantReadQuery(SocialInboxQueryDto, {
      organizationId: targetOrganizationId,
    });
    const request = tenantReadRequest(user, query);
    await controller.countUnreadConversations(request, user, query);
    expect(mock.mock.calls[0]?.[0]).toMatchObject({
      organizationId: targetOrganizationId,
      brandId: undefined,
    });
    expect(fieldValues(mock.mock.calls[0], 'brandId')).not.toContain(
      sessionBrandId,
    );
  });
  it('rejects a member foreign organization', async () => {
    const { controller, mock } = setup();
    const user = memberUser;
    const query = tenantReadQuery(SocialInboxQueryDto, {
      organizationId: targetOrganizationId,
    });
    const request = tenantReadRequest(user, query);
    await expect(
      controller.countUnreadConversations(request, user, query),
    ).rejects.toThrow(ForbiddenException);
    expect(mock).not.toHaveBeenCalled();
  });
  it('retains the member session scope', async () => {
    const { controller, mock } = setup();
    const user = memberUser;
    const query = tenantReadQuery(SocialInboxQueryDto, {});
    const request = tenantReadRequest(user);
    await controller.countUnreadConversations(request, user, query);
    expect(mock.mock.calls[0]?.[0]).toMatchObject({
      organizationId: sessionOrganizationId,
      brandId: sessionBrandId,
    });
  });
});

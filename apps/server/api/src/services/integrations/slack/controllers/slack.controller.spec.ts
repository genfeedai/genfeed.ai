import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { SlackController } from '@api/services/integrations/slack/controllers/slack.controller';
import { SlackService } from '@api/services/integrations/slack/services/slack.service';
import {
  adminUser,
  memberUser,
  sessionBrandId,
  targetOrganizationId,
  tenantReadRequest,
} from '@api-test/helpers/tenant-read.fixture';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

const CHANNELS = [{ id: 'C1', isPrivate: false, name: 'general' }];

describe('SlackController channels', () => {
  async function setup() {
    // A workspace is connected only for the target organization, so a lookup
    // under any other organization finds nothing.
    const credentialsService = {
      resolveBrandAccount: vi.fn(
        async ({ organizationId }: { organizationId: string }) =>
          organizationId === targetOrganizationId
            ? { accessToken: EncryptionUtil.encrypt('xoxb-test') }
            : null,
      ),
    };
    const slackService = {
      listChannels: vi.fn(async (token: string) =>
        token === 'xoxb-test' ? CHANNELS : [],
      ),
    };
    const module = await Test.createTestingModule({
      controllers: [SlackController],
      providers: [
        { provide: CredentialsService, useValue: credentialsService },
        { provide: SlackService, useValue: slackService },
        { provide: BrandsService, useValue: {} },
      ],
    }).compile();
    return module.get(SlackController);
  }

  it('lists the channels of the workspace connected to the session organization', async () => {
    const controller = await setup();
    const user = { ...memberUser, organizationId: targetOrganizationId };

    const result = await controller.channels(
      user,
      tenantReadRequest(user),
      sessionBrandId,
      '',
    );

    expect(result).toEqual({ data: CHANNELS });
  });

  it('reads the pinned organization for a verified superadmin override', async () => {
    const controller = await setup();

    const result = await controller.channels(
      adminUser,
      tenantReadRequest(adminUser),
      sessionBrandId,
      '',
      targetOrganizationId,
    );

    expect(result).toEqual({ data: CHANNELS });
  });

  it('answers not found when the session organization has no workspace', async () => {
    const controller = await setup();

    await expect(
      controller.channels(
        memberUser,
        tenantReadRequest(memberUser),
        sessionBrandId,
        '',
      ),
    ).rejects.toThrow(HttpException);
  });

  it('refuses a member who names another organization', async () => {
    const controller = await setup();

    await expect(
      controller.channels(
        memberUser,
        tenantReadRequest(memberUser),
        sessionBrandId,
        '',
        targetOrganizationId,
      ),
    ).rejects.toThrow(HttpException);
  });
});

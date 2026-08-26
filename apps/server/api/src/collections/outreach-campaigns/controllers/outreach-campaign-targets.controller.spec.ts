import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { OutreachCampaignTargetsController } from '@api/collections/outreach-campaigns/controllers/outreach-campaign-targets.controller';
import { OutreachCampaignTargetOperationsService } from '@api/collections/outreach-campaigns/services/outreach-campaign-target-operations.service';
import { CampaignTargetType } from '@genfeedai/enums';
import { Test, type TestingModule } from '@nestjs/testing';

describe('OutreachCampaignTargetsController', () => {
  const user = {
    brandId: 'brand_1',
    id: 'user_1',
    organizationId: 'org_1',
    userId: 'user_1',
  } as User;
  const targetOperationsService = {
    addTargets: vi.fn(),
    discoverTargets: vi.fn(),
    getTargets: vi.fn(),
    parseUrl: vi.fn(),
    previewReply: vi.fn(),
  };
  let controller: OutreachCampaignTargetsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OutreachCampaignTargetsController],
      providers: [
        {
          provide: OutreachCampaignTargetOperationsService,
          useValue: targetOperationsService,
        },
      ],
    }).compile();

    controller = module.get(OutreachCampaignTargetsController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('delegates target addition with the authenticated scope', async () => {
    const body = {
      targetType: CampaignTargetType.TWEET,
      urls: ['https://x.com/genfeedai/status/123'],
    };
    targetOperationsService.addTargets.mockResolvedValue({
      added: 1,
      skipped: 0,
    });

    await expect(
      controller.addTargets('campaign_1', user, body),
    ).resolves.toEqual({ added: 1, skipped: 0 });
    expect(targetOperationsService.addTargets).toHaveBeenCalledWith(
      'campaign_1',
      user,
      body,
    );
  });

  it('delegates URL parsing without reshaping the result', () => {
    const parsed = {
      externalId: '123',
      platform: 'twitter',
      targetType: 'tweet',
      valid: true,
    };
    targetOperationsService.parseUrl.mockReturnValue(parsed);

    expect(
      controller.parseUrlEndpoint({
        url: 'https://x.com/genfeedai/status/123',
      }),
    ).toBe(parsed);
    expect(targetOperationsService.parseUrl).toHaveBeenCalledWith(
      'https://x.com/genfeedai/status/123',
    );
  });

  it('delegates target reads with the authenticated scope', async () => {
    const targets = [{ id: 'target_1' }];
    targetOperationsService.getTargets.mockResolvedValue(targets);

    await expect(controller.getTargets('campaign_1', user)).resolves.toBe(
      targets,
    );
    expect(targetOperationsService.getTargets).toHaveBeenCalledWith(
      'campaign_1',
      user,
    );
  });

  it('delegates target discovery with its options intact', async () => {
    const body = { addToCampaign: true, limit: 25 };
    const result = { added: 2, discovered: 2, targets: [] };
    targetOperationsService.discoverTargets.mockResolvedValue(result);

    await expect(
      controller.discoverTargets('campaign_1', user, body),
    ).resolves.toBe(result);
    expect(targetOperationsService.discoverTargets).toHaveBeenCalledWith(
      'campaign_1',
      user,
      body,
    );
  });

  it('delegates reply previews with campaign and target scope', async () => {
    const result = { replyText: 'Hello', target: { id: 'target_1' } };
    targetOperationsService.previewReply.mockResolvedValue(result);

    await expect(
      controller.previewReply('campaign_1', 'target_1', user),
    ).resolves.toBe(result);
    expect(targetOperationsService.previewReply).toHaveBeenCalledWith(
      'campaign_1',
      'target_1',
      user,
    );
  });
});

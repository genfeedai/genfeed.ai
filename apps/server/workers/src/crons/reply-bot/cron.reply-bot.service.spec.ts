import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ReplyBotConfigsService } from '@api/collections/reply-bot-configs/services/reply-bot-configs.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { ReplyBotOrchestratorService } from '@api/services/reply-bot/reply-bot-orchestrator.service';
import { CredentialPlatform, ReplyBotPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { CronReplyBotService } from '@workers/crons/reply-bot/cron.reply-bot.service';

describe('CronReplyBotService', () => {
  let service: CronReplyBotService;
  let replyBotConfigsService: { find: ReturnType<typeof vi.fn> };
  let credentialsService: { findOne: ReturnType<typeof vi.fn> };
  let replyBotOrchestratorService: {
    processOrganizationBots: ReturnType<typeof vi.fn>;
  };
  let cacheService: {
    acquireLock: ReturnType<typeof vi.fn>;
    releaseLock: ReturnType<typeof vi.fn>;
  };
  let logger: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    replyBotConfigsService = { find: vi.fn() };
    credentialsService = { findOne: vi.fn() };
    replyBotOrchestratorService = { processOrganizationBots: vi.fn() };
    cacheService = {
      acquireLock: vi.fn().mockResolvedValue(true),
      releaseLock: vi.fn().mockResolvedValue(undefined),
    };
    logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronReplyBotService,
        { provide: ReplyBotConfigsService, useValue: replyBotConfigsService },
        { provide: CredentialsService, useValue: credentialsService },
        {
          provide: ReplyBotOrchestratorService,
          useValue: replyBotOrchestratorService,
        },
        { provide: CacheService, useValue: cacheService },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    service = module.get(CronReplyBotService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should no-op when lock is held', async () => {
    cacheService.acquireLock.mockResolvedValueOnce(false);

    await service.processReplyBots();

    expect(replyBotConfigsService.find).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      'Reply bot cron already running (lock held), skipping',
      'CronReplyBotService',
    );
  });

  it('should no-op when there are no active configs', async () => {
    replyBotConfigsService.find.mockResolvedValueOnce([]);

    await service.processReplyBots();

    expect(logger.log).toHaveBeenCalledWith(
      'No active reply bot configs found for polling',
      'CronReplyBotService',
    );
    expect(cacheService.releaseLock).toHaveBeenCalled();
  });

  it('should group configs by org and credential before polling', async () => {
    const organizationId = 'org-id-1';
    const credentialId = 'cred-id-1';

    replyBotConfigsService.find.mockResolvedValueOnce([
      {
        credential: credentialId,
        isActive: true,
        organization: organizationId,
      },
      {
        credential: credentialId,
        isActive: true,
        organization: organizationId,
      },
    ]);
    credentialsService.findOne.mockResolvedValueOnce({
      accessToken: 'token',
      accessTokenSecret: 'secret',
      externalId: 'external',
      platform: CredentialPlatform.TWITTER,
      refreshToken: 'refresh',
      username: 'replybot',
    });
    replyBotOrchestratorService.processOrganizationBots.mockResolvedValueOnce([
      {
        botConfigId: 'bot-1',
        contentProcessed: 1,
        dmsSent: 0,
        errors: 0,
        platform: ReplyBotPlatform.TWITTER,
        repliesSent: 1,
        skipped: 0,
      },
    ]);

    await service.processReplyBots();

    expect(credentialsService.findOne).toHaveBeenCalledTimes(1);
    expect(
      replyBotOrchestratorService.processOrganizationBots,
    ).toHaveBeenCalledTimes(1);
    expect(
      replyBotOrchestratorService.processOrganizationBots,
    ).toHaveBeenCalledWith(organizationId, {
      accessToken: 'token',
      accessTokenSecret: 'secret',
      externalId: 'external',
      platform: CredentialPlatform.TWITTER,
      refreshToken: 'refresh',
      username: 'replybot',
    });
  });

  it('should skip missing credentials and continue', async () => {
    const missingOrgId = 'org-id-missing';
    const missingCredentialId = 'cred-id-missing';
    const goodOrgId = 'org-id-good';
    const goodCredentialId = 'cred-id-good';

    replyBotConfigsService.find.mockResolvedValueOnce([
      {
        credential: missingCredentialId,
        isActive: true,
        organization: missingOrgId,
      },
      { credential: goodCredentialId, isActive: true, organization: goodOrgId },
    ]);
    credentialsService.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        accessToken: 'token',
        accessTokenSecret: 'secret',
        externalId: 'external',
        platform: CredentialPlatform.TWITTER,
        refreshToken: 'refresh',
        username: 'replybot',
      });
    replyBotOrchestratorService.processOrganizationBots.mockResolvedValueOnce([
      {
        botConfigId: 'bot-1',
        contentProcessed: 1,
        dmsSent: 0,
        errors: 0,
        platform: ReplyBotPlatform.TWITTER,
        repliesSent: 1,
        skipped: 0,
      },
    ]);

    await service.processReplyBots();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Skipping reply bot polling because credential'),
      'CronReplyBotService',
    );
    expect(
      replyBotOrchestratorService.processOrganizationBots,
    ).toHaveBeenCalledTimes(1);
    expect(cacheService.releaseLock).toHaveBeenCalled();
  });
});

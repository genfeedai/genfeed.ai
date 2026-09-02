vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: vi.fn((value: string) => value) },
}));

import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { DistributionsService } from '@api/collections/distributions/services/distributions.service';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { TelegramDistributionService } from '@api/services/distribution/telegram/telegram-distribution.service';
import { createSystemWorkflowRunnerMock } from '@api/shared/testing/system-workflow-runner-mock';
import { DistributionContentType } from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, type TestingModule } from '@nestjs/testing';

describe('TelegramDistributionService', () => {
  let service: TelegramDistributionService;
  let credentialsFindOneMock: ReturnType<typeof vi.fn>;
  let credentialsResolveMock: ReturnType<typeof vi.fn>;
  let httpPostMock: ReturnType<typeof vi.fn>;
  let markAsFailedMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    credentialsFindOneMock = vi.fn().mockResolvedValue({
      accessToken: 'sibling-brand-token',
    });
    credentialsResolveMock = vi.fn().mockResolvedValue(null);
    httpPostMock = vi.fn();
    markAsFailedMock = vi.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramDistributionService,
        { provide: ConfigService, useValue: { get: vi.fn() } },
        {
          provide: CredentialsService,
          useValue: {
            findOne: credentialsFindOneMock,
            resolveBrandAccount: credentialsResolveMock,
          },
        },
        {
          provide: DistributionsService,
          useValue: {
            createDistribution: vi.fn().mockResolvedValue({
              id: 'distribution-1',
            }),
            markAsFailed: markAsFailedMock,
            markAsPublished: vi.fn(),
          },
        },
        {
          provide: WorkflowExecutionQueueService,
          useValue: { queueSystemWorkflow: vi.fn() },
        },
        {
          provide: SystemWorkflowRunnerService,
          useValue: createSystemWorkflowRunnerMock(),
        },
        { provide: HttpService, useValue: { post: httpPostMock } },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
      ],
    }).compile();

    service = module.get<TelegramDistributionService>(
      TelegramDistributionService,
    );
  });

  it('fails closed when a brand-scoped credential cannot be resolved', async () => {
    await expect(
      service.sendImmediate({
        brandId: 'brand-1',
        chatId: 'chat-1',
        contentType: DistributionContentType.TEXT,
        credentialId: 'credential-from-another-brand',
        organizationId: 'org-1',
        text: 'hello',
        userId: 'user-1',
      }),
    ).rejects.toThrow('Telegram credential not found for this brand');

    expect(credentialsResolveMock).toHaveBeenCalledWith({
      brandId: 'brand-1',
      credentialId: 'credential-from-another-brand',
      organizationId: 'org-1',
      platform: 'telegram',
    });
    expect(credentialsFindOneMock).not.toHaveBeenCalled();
    expect(httpPostMock).not.toHaveBeenCalled();
    expect(markAsFailedMock).toHaveBeenCalledWith(
      'distribution-1',
      'Telegram credential not found for this brand',
    );
  });
});

vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: (value: string) => value },
}));

import type { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import type { DistributionsService } from '@api/collections/distributions/services/distributions.service';
import type { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import type { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { TelegramDistributionService } from '@api/services/distribution/telegram/telegram-distribution.service';
import { createSystemWorkflowRunnerMock } from '@api/shared/testing/system-workflow-runner-mock';
import { DistributionContentType } from '@genfeedai/contracts';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';

type Credential = {
  accessToken: string;
  brandId: string;
  id: string;
  organizationId: string;
};
type Distribution = {
  error?: string;
  id: string;
  messageId?: string;
  status: string;
};

/**
 * Telegram credentials per brand, the distributions table and the Telegram
 * Bot API, which records every request it receives.
 */
function buildService(credentials: Credential[]) {
  const distributions: Distribution[] = [];
  const telegramRequests: { body: unknown; url: string }[] = [];
  const credentialsService = {
    findOne: async () => {
      throw new Error('organization-wide credential lookup must not run');
    },
    resolveBrandAccount: async (scope: {
      brandId: string;
      credentialId?: string;
      organizationId: string;
    }) =>
      credentials.find(
        (row) =>
          row.organizationId === scope.organizationId &&
          row.brandId === scope.brandId &&
          (!scope.credentialId || row.id === scope.credentialId),
      ) ?? null,
  };
  const distributionsService = {
    createDistribution: async () => {
      const row = {
        id: `distribution-${distributions.length + 1}`,
        status: 'publishing',
      };
      distributions.push(row);
      return row;
    },
    markAsFailed: async (id: string, error: string) => {
      Object.assign(distributions.find((row) => row.id === id) ?? {}, {
        error,
        status: 'failed',
      });
    },
    markAsPublished: async (id: string, messageId?: string) => {
      Object.assign(distributions.find((row) => row.id === id) ?? {}, {
        messageId,
        status: 'published',
      });
    },
  };
  const http = {
    post: (url: string, body: unknown) => {
      telegramRequests.push({ body, url });
      return of({ data: { ok: true, result: { message_id: 77 } } });
    },
  };
  const silent = () => undefined;
  const service = new TelegramDistributionService(
    { get: () => undefined } as unknown as ConfigService,
    credentialsService as unknown as CredentialsService,
    distributionsService as unknown as DistributionsService,
    {} as unknown as WorkflowExecutionQueueService,
    createSystemWorkflowRunnerMock() as unknown as SystemWorkflowRunnerService,
    http as unknown as HttpService,
    { error: silent, log: silent, warn: silent } as unknown as LoggerService,
  );
  return { distributions, service, telegramRequests };
}

const credentials: Credential[] = [
  {
    accessToken: 'brand-1-token',
    brandId: 'brand-1',
    id: 'credential-brand-1',
    organizationId: 'org-1',
  },
  {
    accessToken: 'sibling-brand-token',
    brandId: 'brand-2',
    id: 'credential-from-another-brand',
    organizationId: 'org-1',
  },
];

const message = {
  brandId: 'brand-1',
  chatId: 'chat-1',
  contentType: DistributionContentType.TEXT,
  organizationId: 'org-1',
  text: 'hello',
  userId: 'user-1',
};

describe('TelegramDistributionService', () => {
  it('sends with the brand credential and records the published message', async () => {
    const { distributions, service, telegramRequests } =
      buildService(credentials);

    await expect(
      service.sendImmediate({ ...message, credentialId: 'credential-brand-1' }),
    ).resolves.toEqual({
      distributionId: 'distribution-1',
      telegramMessageId: '77',
    });

    expect(telegramRequests).toEqual([
      {
        body: expect.objectContaining({ chat_id: 'chat-1', text: 'hello' }),
        url: 'https://api.telegram.org/botbrand-1-token/sendMessage',
      },
    ]);
    expect(distributions).toEqual([
      { id: 'distribution-1', messageId: '77', status: 'published' },
    ]);
  });

  it('fails closed when a brand-scoped credential cannot be resolved', async () => {
    const { distributions, service, telegramRequests } =
      buildService(credentials);

    await expect(
      service.sendImmediate({
        ...message,
        credentialId: 'credential-from-another-brand',
      }),
    ).rejects.toThrow('Telegram credential not found for this brand');

    expect(telegramRequests).toEqual([]);
    expect(distributions).toEqual([
      {
        error: 'Telegram credential not found for this brand',
        id: 'distribution-1',
        status: 'failed',
      },
    ]);
  });
});

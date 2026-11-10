import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { GenfeedPublisherService } from '@api/services/integrations/publishers/genfeed-publisher.service';
import type { PublishContext } from '@api/services/integrations/publishers/interfaces/publisher.interface';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { TargetExecutionState } from '@genfeedai/contracts';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it, vi } from 'vitest';

interface BrandRow {
  isDeleted: boolean;
  scope: string;
  slug: string;
}

const channel = { externalHandle: 'acme' };

function createPublisher(brand: BrandRow | null): GenfeedPublisherService {
  const prisma = {
    brand: { findFirst: vi.fn().mockResolvedValue(brand) },
    credential: {
      updateMany: async ({ data }: { data: { externalHandle: string } }) => {
        channel.externalHandle = data.externalHandle;
        return { count: 1 };
      },
    },
  } as unknown as PrismaService;
  const config = {
    get: (key: string) =>
      key === 'GENFEEDAI_PUBLIC_URL' ? 'https://genfeed.ai/' : undefined,
  } as unknown as ConfigService;
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
  return new GenfeedPublisherService(config, logger, prisma);
}

const context = {
  brandId: 'brand-1',
  credential: {
    externalHandle: 'acme',
    id: 'cred-gf',
  } as unknown as CredentialDocument,
  organizationId: 'org-1',
  postId: 'post-1',
  settings: {},
} as unknown as PublishContext;

describe('GenfeedPublisherService', () => {
  it("publishes to the brand's profile page", async () => {
    const publisher = createPublisher({
      isDeleted: false,
      scope: 'PUBLIC',
      slug: 'acme',
    });

    await expect(publisher.publish(context)).resolves.toMatchObject({
      executionState: TargetExecutionState.PUBLISHED,
      externalId: 'post-1',
      platform: 'genfeed',
      success: true,
      url: 'https://genfeed.ai/@acme/posts/post-1',
    });
  });

  it.each([
    [
      'a private brand',
      { isDeleted: false, scope: 'ORGANIZATION', slug: 'acme' },
    ],
    ['a deleted brand', { isDeleted: true, scope: 'PUBLIC', slug: 'acme' }],
    ['a missing brand', null],
  ])('refuses %s without retrying', async (_name, brand) => {
    const publisher = createPublisher(brand);

    await expect(publisher.publish(context)).resolves.toMatchObject({
      errorCode: 'genfeed_profile_private',
      executionState: TargetExecutionState.FAILED,
      success: false,
    });
  });

  it('moves the channel to a renamed handle when it publishes', async () => {
    channel.externalHandle = 'acme';
    const publisher = createPublisher({
      isDeleted: false,
      scope: 'PUBLIC',
      slug: 'acme-studio',
    });

    await expect(publisher.publish(context)).resolves.toMatchObject({
      url: 'https://genfeed.ai/@acme-studio/posts/post-1',
    });
    expect(channel.externalHandle).toBe('acme-studio');
  });

  it('links a published post from its credential handle', () => {
    const publisher = createPublisher(null);

    expect(publisher.buildPostUrl('post-9', context.credential)).toBe(
      'https://genfeed.ai/@acme/posts/post-9',
    );
  });
});

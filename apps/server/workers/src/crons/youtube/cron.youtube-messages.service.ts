import { SocialInboxService } from '@api/collections/social-inbox/services/social-inbox.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { CredentialPlatform as PrismaCredentialPlatform } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class CronYoutubeMessagesService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly socialInboxService: SocialInboxService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async syncYoutubeMessages(): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${url} started`);

    try {
      const credentials = await this.prisma.credential.findMany({
        select: { brandId: true, id: true, organizationId: true },
        where: {
          brandId: { not: null },
          isConnected: true,
          isDeleted: false,
          organizationId: { not: null },
          platform: PrismaCredentialPlatform.YOUTUBE,
        },
      });

      let messagesCreated = 0;
      let conversationsCreated = 0;

      for (const credential of credentials) {
        if (!credential.organizationId || !credential.brandId) {
          continue;
        }

        try {
          const result = await this.socialInboxService.ingestYoutubeComments(
            {
              brandId: credential.brandId,
              organizationId: credential.organizationId,
            },
            { credentialId: credential.id, limit: 25 },
          );

          messagesCreated += result.messagesCreated;
          conversationsCreated += result.conversationsCreated;
        } catch (error: unknown) {
          this.logger.warn(`${url} credential sync failed`, {
            credentialId: credential.id,
            error,
          });
        }
      }

      this.logger.log(`${url} completed`, {
        conversationsCreated,
        credentialCount: credentials.length,
        messagesCreated,
      });
    } catch (error: unknown) {
      this.logger.error(`${url} failed`, error);
    }
  }
}

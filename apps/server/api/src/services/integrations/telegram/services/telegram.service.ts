import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { TelegramAuthUtil } from '@api/shared/utils/telegram-auth/telegram-auth.util';
import { CredentialPlatform } from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

export interface TelegramAuthData {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

@Injectable()
export class TelegramService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly botToken: string | undefined;

  constructor(
    private readonly configService: ConfigService,
    private readonly credentialsService: CredentialsService,
    private readonly loggerService: LoggerService,
  ) {
    this.botToken = this.configService.get('TELEGRAM_BOT_TOKEN');
  }

  /**
   * Verify and save Telegram authentication data
   *
   * @param organizationId - Organization ID
   * @param brandId - Brand ID
   * @param userId - User ID
   * @param authData - Telegram auth data from Login Widget
   * @returns Saved credential
   */
  async verifyAndSaveAuth(
    organizationId: string,
    brandId: string,
    userId: string,
    authData: TelegramAuthData,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      // Validate required fields
      if (
        !TelegramAuthUtil.hasRequiredFields(
          authData as unknown as Record<string, unknown>,
        )
      ) {
        this.loggerService.error(`${url} missing required fields`, {
          authData,
        });
        throw new HttpException(
          {
            detail: 'Missing required fields from Telegram',
            title: 'Invalid Auth Data',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      // Validate auth date freshness (24 hours)
      if (!TelegramAuthUtil.isAuthDateValid(authData.auth_date)) {
        this.loggerService.error(`${url} auth data expired`, {
          authDate: authData.auth_date,
        });
        throw new HttpException(
          {
            detail: 'Telegram authentication data is too old',
            title: 'Expired Authentication',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      // Verify HMAC signature
      if (
        !TelegramAuthUtil.verifyAuthData(
          authData as unknown as Record<string, unknown>,
          this.botToken!,
        )
      ) {
        this.loggerService.error(`${url} invalid HMAC signature`);
        throw new HttpException(
          {
            detail: 'Telegram authentication signature is invalid',
            title: 'Invalid Signature',
          },
          HttpStatus.UNAUTHORIZED,
        );
      }

      // The Login Widget only proves which Telegram account authorized us once
      // it hands back `authData.id`, so provision a pending row and let identity
      // reconciliation decide between refreshing an account and adding one.
      const pending = await this.credentialsService.createPendingForBrand(
        { id: brandId, organizationId },
        userId,
        CredentialPlatform.TELEGRAM,
      );

      const credential: CredentialDocument =
        await this.credentialsService.connectAccount(
          pending.id,
          organizationId,
          {
            avatarUrl: authData.photo_url,
            handle: authData.username || authData.first_name,
            id: authData.id.toString(),
            name: authData.username
              ? `${authData.first_name}${authData.last_name ? ` ${authData.last_name}` : ''}`
              : authData.first_name,
          },
          { isConnected: true },
        );

      this.loggerService.log(`${url} connected credential`, {
        credentialId: credential.id,
      });

      return credential;
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.loggerService.error(`${url} failed`, error);
      throw new HttpException(
        {
          detail:
            (error as Error).message ||
            'Failed to verify Telegram authentication',
          title: 'Telegram Verification Failed',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

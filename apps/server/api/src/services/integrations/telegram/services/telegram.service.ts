import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { TelegramAuthUtil } from '@api/shared/utils/telegram-auth/telegram-auth.util';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Types } from 'mongoose';

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
      if (!TelegramAuthUtil.hasRequiredFields(authData)) {
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
      if (!TelegramAuthUtil.verifyAuthData(authData, this.botToken!)) {
        this.loggerService.error(`${url} invalid HMAC signature`);
        throw new HttpException(
          {
            detail: 'Telegram authentication signature is invalid',
            title: 'Invalid Signature',
          },
          HttpStatus.UNAUTHORIZED,
        );
      }

      // Check if credential already exists
      const existingCredential = await this.credentialsService.findOne({
        brand: new Types.ObjectId(brandId),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
        platform: CredentialPlatform.TELEGRAM,
      });

      // Prepare credential data
      const credentialData = {
        brand: new Types.ObjectId(brandId),
        externalAvatar: authData.photo_url,
        externalHandle: authData.username || authData.first_name,
        externalId: authData.id.toString(),
        externalName: authData.username
          ? `${authData.first_name}${authData.last_name ? ` ${authData.last_name}` : ''}`
          : authData.first_name,
        isConnected: true,
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
        platform: CredentialPlatform.TELEGRAM,
        user: new Types.ObjectId(userId),
      };

      let credential;
      if (existingCredential) {
        // Update existing credential
        credential = await this.credentialsService.patch(
          existingCredential._id,
          credentialData,
        );
        this.loggerService.log(`${url} updated existing credential`, {
          credentialId: credential._id,
        });
      } else {
        // Create new credential
        // @ts-expect-error CreateCredentialDto shape
        credential = await this.credentialsService.create(credentialData);
        this.loggerService.log(`${url} created new credential`, {
          credentialId: credential._id,
        });
      }

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

  /**
   * Disconnect Telegram account
   *
   * @param organizationId - Organization ID
   * @param brandId - Brand ID
   */
  async disconnect(organizationId: string, brandId: string) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.credentialsService.findOne({
        brand: new Types.ObjectId(brandId),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
        platform: CredentialPlatform.TELEGRAM,
      });

      if (!credential) {
        throw new HttpException(
          {
            detail: 'Telegram credential not found',
            title: 'Not Found',
          },
          HttpStatus.NOT_FOUND,
        );
      }

      await this.credentialsService.patch(credential._id, {
        isConnected: false,
        isDeleted: true,
      });

      this.loggerService.log(`${url} disconnected credential`, {
        credentialId: credential._id,
      });

      return { success: true };
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.loggerService.error(`${url} failed`, error);
      throw new HttpException(
        {
          detail: (error as Error).message || 'Failed to disconnect Telegram',
          title: 'Disconnect Failed',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

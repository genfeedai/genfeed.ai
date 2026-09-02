import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import {
  createThreadsDeletionReceipt,
  verifyThreadsDeletionReceipt,
  verifyThreadsSignedRequest,
} from '@api/services/integrations/threads/services/threads-callback-signature.util';
import { isUnconfiguredSecret } from '@genfeedai/config';
import { CredentialPlatform } from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

export interface ThreadsDataDeletionResponse {
  confirmation_code: string;
  url: string;
}

@Injectable()
export class ThreadsCallbackService {
  constructor(
    private readonly configService: ConfigService,
    private readonly credentialsService: CredentialsService,
    private readonly loggerService: LoggerService,
  ) {}

  async handleDeauthorization(signedRequest: unknown): Promise<void> {
    const userId = this.authenticate(signedRequest);
    const credentialsPurged =
      await this.credentialsService.purgeProviderAccount(
        CredentialPlatform.THREADS,
        userId,
      );

    this.loggerService.log('Threads deauthorization completed', {
      credentialsPurged,
    });
  }

  async handleDataDeletion(
    signedRequest: unknown,
  ): Promise<ThreadsDataDeletionResponse> {
    const secret = this.getSecret();
    const apiUrl = this.getPublicApiUrl();
    const userId = this.authenticateWithSecret(signedRequest, secret);
    const credentialsPurged =
      await this.credentialsService.purgeProviderAccount(
        CredentialPlatform.THREADS,
        userId,
      );
    const receipt = createThreadsDeletionReceipt(secret);

    this.loggerService.log('Threads data deletion completed', {
      credentialsPurged,
    });

    return {
      confirmation_code: receipt,
      url: new URL(
        `/v1/services/threads/data-deletion/status/${receipt}`,
        `${apiUrl}/`,
      ).toString(),
    };
  }

  getDataDeletionStatus(receipt: string): string {
    const completedAt = verifyThreadsDeletionReceipt(receipt, this.getSecret());

    if (!completedAt) {
      throw new NotFoundException({
        message: 'Data deletion receipt not found',
      });
    }

    return `Threads data deletion completed at ${completedAt.toISOString()}. Confirmation code: ${receipt}`;
  }

  private authenticate(signedRequest: unknown): string {
    return this.authenticateWithSecret(signedRequest, this.getSecret());
  }

  private authenticateWithSecret(
    signedRequest: unknown,
    secret: string,
  ): string {
    if (typeof signedRequest !== 'string' || signedRequest.length === 0) {
      throw new BadRequestException('signed_request is required');
    }

    const payload = verifyThreadsSignedRequest(signedRequest, secret);
    if (!payload) {
      throw new UnauthorizedException('Invalid signed request');
    }

    return payload.user_id;
  }

  private getSecret(): string {
    const secret = this.configService.get('THREADS_CLIENT_SECRET')?.trim();
    if (!secret || isUnconfiguredSecret(secret)) {
      throw new ServiceUnavailableException(
        'Threads callbacks are not configured for this deployment.',
      );
    }

    return secret;
  }

  private getPublicApiUrl(): string {
    const configured = this.configService
      .get('GENFEEDAI_API_PUBLIC_URL')
      ?.trim()
      .replace(/\/+$/, '');

    if (!configured || isUnconfiguredSecret(configured)) {
      throw new ServiceUnavailableException(
        'Threads callbacks are not configured for this deployment.',
      );
    }

    try {
      const url = new URL(configured);
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new TypeError('Unsupported URL protocol');
      }
    } catch {
      throw new ServiceUnavailableException(
        'Threads callbacks are not configured for this deployment.',
      );
    }

    return configured;
  }
}

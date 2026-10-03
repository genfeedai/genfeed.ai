import type { CredentialDocument } from '@api/collections/credentials/credential.types';
import type { ProviderVerificationPage } from '@api/services/integrations/publishers/interfaces/publish-verification.interface';
import {
  PROVIDER_VERIFICATION_PAGE_SIZE,
  PROVIDER_VERIFICATION_REQUEST_TIMEOUT_MS,
} from '@api/services/integrations/publishers/publisher-verification.util';
import { parseThreadsVerificationPage } from '@api/services/integrations/publishers/publisher-verification-pages.util';
import type { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import type { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

/** Reads only the account resolved by the tenant/brand/credential store. */
export async function readThreadsVerificationPage(
  http: HttpService,
  endpoint: string,
  credential: CredentialDocument,
  expectedExternalId: string | null,
  attemptStartedAt: Date,
  cursor?: string,
): Promise<ProviderVerificationPage> {
  if (
    !credential.externalId ||
    !credential.accessToken ||
    credential.externalId !== expectedExternalId
  )
    throw new Error('Threads verification account unavailable or changed');
  const response = await firstValueFrom(
    http.get<unknown>(
      `${endpoint}/${encodeURIComponent(credential.externalId)}/threads`,
      {
        headers: {
          Authorization: `Bearer ${EncryptionUtil.decrypt(credential.accessToken)}`,
        },
        params: {
          ...(cursor ? { after: cursor } : {}),
          fields: 'id,text,timestamp,media_type,is_reply,is_quote_post',
          limit: PROVIDER_VERIFICATION_PAGE_SIZE,
          since: Math.floor(attemptStartedAt.getTime() / 1000),
        },
        timeout: PROVIDER_VERIFICATION_REQUEST_TIMEOUT_MS,
        maxRedirects: 0,
      },
    ),
  );
  return parseThreadsVerificationPage(response.data);
}

export async function readThreadsAccountDetails(
  http: HttpService,
  logger: LoggerService,
  endpoint: string,
  logPrefix: string,
  accessToken: string,
): Promise<unknown> {
  try {
    const response = await firstValueFrom(
      http.get(`${endpoint}/me`, {
        params: {
          access_token: accessToken,
          fields: 'id,username,threads_profile_picture_url,threads_biography',
        },
      }),
    );
    logger.log(`${logPrefix} succeeded`, { hasAccount: !!response.data });
    return response.data;
  } catch (error: unknown) {
    logger.error(`${logPrefix} failed`, error);
    throw error;
  }
}

export function requireThreadsString(
  value: string | null | undefined,
  label: string,
): string {
  if (!value) throw new Error(`${label} is required`);
  return value;
}

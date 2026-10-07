import type { ApiKeyHelperService } from '@api/services/api-key/api-key-helper.service';
import type { AvatarVideoJobResult } from '@api/services/avatar-video/avatar-video-provider.interface';
import type { ByokService } from '@api/services/byok/byok.service';
import { ApiKeyCategory, ByokProvider } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import type { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { z } from 'zod';

const heygenStatusSchema = z.object({
  data: z
    .object({
      status: z.string(),
      video_url: z.string().nullish(),
      failure_message: z.string().nullish(),
    })
    .nullish(),
});

/**
 * Shared fixed-endpoint adapter. Credentials are resolved for the proved tenant.
 * `failed` means HeyGen positively reported failure. Anything we could not
 * learn (no key, transport error, malformed body, missing data) is `unknown`.
 */
export async function readHeygenVideoStatus(
  jobId: string,
  organizationId: string,
  byokService: ByokService,
  apiKeyHelperService: ApiKeyHelperService,
  httpService: HttpService,
  logger: LoggerService,
  timeoutMs = 15_000,
): Promise<AvatarVideoJobResult> {
  try {
    const byokKey = await byokService.resolveApiKey(
      organizationId,
      ByokProvider.HEYGEN,
    );
    const apiKey =
      byokKey?.apiKey ?? apiKeyHelperService.getApiKey(ApiKeyCategory.HEYGEN);

    if (!apiKey) {
      logger.error(
        'HeygenVideoStatus getStatus failed: no HeyGen API key resolved',
        { organizationId },
      );
      return {
        error: 'No HeyGen API key configured (BYOK or env HEYGEN_KEY).',
        jobId,
        providerName: 'heygen',
        status: 'unknown',
      };
    }

    const response = await firstValueFrom(
      httpService.get(
        `https://api.heygen.com/v3/videos/${encodeURIComponent(jobId)}`,
        {
          headers: { 'X-Api-Key': apiKey },
          timeout: timeoutMs,
        },
      ),
    );

    const parsed = heygenStatusSchema.safeParse(response.data);
    const data = parsed.success ? parsed.data.data : undefined;

    if (!data) {
      return { jobId, providerName: 'heygen', status: 'unknown' };
    }

    if (data.status === 'completed') {
      return {
        jobId,
        providerName: 'heygen',
        status: 'completed',
        videoUrl: data.video_url ?? undefined,
      };
    }

    if (data.status === 'failed' || data.status === 'error') {
      return {
        error: data.failure_message || 'HeyGen video generation failed',
        jobId,
        providerName: 'heygen',
        status: 'failed',
      };
    }

    return { jobId, providerName: 'heygen', status: 'processing' };
  } catch (error: unknown) {
    logger.error('HeygenVideoStatus getStatus failed', error);
    return { jobId, providerName: 'heygen', status: 'unknown' };
  }
}

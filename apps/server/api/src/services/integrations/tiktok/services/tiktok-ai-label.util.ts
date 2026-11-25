import {
  type ChannelTargetSettings,
  readChannelSettingBoolean,
  TIKTOK_AI_GENERATED_SETTING_KEY,
} from '@genfeedai/contracts/api-types/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { traced } from '@libs/tracing/traced';
import type { HttpService } from '@nestjs/axios';
import type { AxiosError, AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';

/**
 * Where TikTok's reference puts `is_aigc`: in `post_info` for a video
 * (Direct Post) and at the top of the body for a photo post. The video page
 * lists it among the `post_info` fields without naming the path, so the
 * request that carries it can be refused; see {@link postTikTokInit}.
 */
export type TikTokAiLabelPlacement = 'body' | 'post_info';

/** The label is on unless the target turns it off. */
export function wantsTikTokAiLabel(settings: ChannelTargetSettings): boolean {
  return (
    readChannelSettingBoolean(settings, TIKTOK_AI_GENERATED_SETTING_KEY) ===
    true
  );
}

/** TikTok's commercial content disclosure, as the two `post_info` toggles. */
export function tikTokBrandToggles(settings: ChannelTargetSettings) {
  return {
    brand_content_toggle:
      settings.commercialContent === true && settings.brandedContent === true,
    brand_organic_toggle:
      settings.commercialContent === true && settings.yourBrand === true,
  };
}

function withAiLabel(
  body: Record<string, unknown>,
  placement: TikTokAiLabelPlacement,
): Record<string, unknown> {
  return placement === 'body'
    ? { ...body, is_aigc: true }
    : {
        ...body,
        post_info: {
          ...(body.post_info as Record<string, unknown>),
          is_aigc: true,
        },
      };
}

/**
 * Starts a TikTok publish with the AI label when one is asked for. Nothing is
 * posted at the init call, so if TikTok refuses the labelled request with a
 * client error (HTTP 400) the same request is sent once more without the label
 * and a warning is logged: a refused label costs the label, never the post.
 */
export const postTikTokInit = traced(
  'postTikTokInit',
  async (
    http: HttpService,
    logger: LoggerService,
    endpoint: string,
    body: Record<string, unknown>,
    config: { headers: Record<string, string> },
    aiLabel?: TikTokAiLabelPlacement,
  ): Promise<AxiosResponse> => {
    const send = (payload: Record<string, unknown>) =>
      firstValueFrom(http.post(endpoint, payload, config));
    if (!aiLabel) return send(body);
    try {
      return await send(withAiLabel(body, aiLabel));
    } catch (error: unknown) {
      if ((error as AxiosError)?.response?.status !== 400) throw error;
      logger.warn(
        'TikTok refused the publish request with the AI label; sending it again without it',
        { placement: aiLabel },
      );
      return send(body);
    }
  },
);

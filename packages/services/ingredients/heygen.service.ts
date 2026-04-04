import type { IHeyGen } from '@cloud/interfaces';
import { HeyGenServiceSerializer } from '@genfeedai/client/serializers';
import { API_ENDPOINTS } from '@genfeedai/constants';
import { HeyGen } from '@models/integrations/heygen.model';
import { BaseService } from '@services/core/base.service';
import { EnvironmentService } from '@services/core/environment.service';

/**
 * HeyGen Service - For fetching avatars/voices and generating avatar videos
 * Note: Voices and avatars are stored as ingredients in the DB
 * Use IngredientsService or VoicesService/AvatarsService to fetch them
 *
 * Generation: POST /videos/avatar (AvatarVideoController on backend)
 */

export class HeyGenService extends BaseService<IHeyGen> {
  constructor(token: string) {
    super(API_ENDPOINTS.HEYGEN, token, HeyGen, HeyGenServiceSerializer);
  }

  public static getInstance(token: string): HeyGenService {
    return BaseService.getDataServiceInstance(
      HeyGenService,
      token,
    ) as HeyGenService;
  }

  /**
   * Generate avatar video
   * The backend endpoint is POST /videos/avatar (AvatarVideoController),
   * NOT POST /heygen. This service's baseURL is /heygen (for fetching avatars/voices),
   * so we replace the base path for generation calls.
   *
   * Maps frontend voiceId → backend elevenlabsVoiceId
   */
  async generate(payload: {
    voiceId?: string;
    avatarId?: string;
    photoUrl?: string;
    text: string;
    audioUrl?: string;
  }): Promise<IHeyGen> {
    const { voiceId, ...rest } = payload;

    // Map voiceId → elevenlabsVoiceId for backend compatibility
    const backendPayload: Record<string, unknown> = { ...rest };
    if (voiceId) {
      backendPayload.elevenlabsVoiceId = voiceId;
    }

    // Build absolute URL to bypass this.instance's /heygen baseURL
    // Target: POST /videos/avatar (AvatarVideoController)
    const avatarUrl = `${EnvironmentService.apiEndpoint}${API_ENDPOINTS.VIDEOS}/avatar`;

    const response = await this.instance.post(avatarUrl, backendPayload);

    return response.data as unknown as IHeyGen;
  }
}

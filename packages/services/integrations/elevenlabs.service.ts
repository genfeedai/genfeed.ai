import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';

export interface ElevenLabsVoice {
  voiceId: string;
  name: string;
  preview?: string;
}

export interface ElevenLabsVoicesResponse {
  data: {
    id: string;
    type: string;
    attributes: {
      voices: ElevenLabsVoice[];
      provider: 'elevenlabs';
    };
  };
}

export class ElevenLabsService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/avatars/elevenlabs`, token);
  }

  public static getInstance(token: string): ElevenLabsService {
    return HTTPBaseService.getBaseServiceInstance(ElevenLabsService, token);
  }

  /**
   * Fetch available ElevenLabs voices
   */
  async getVoices(): Promise<ElevenLabsVoice[]> {
    const response =
      await this.instance.get<ElevenLabsVoicesResponse>('voices');
    return response.data.data.attributes.voices;
  }
}

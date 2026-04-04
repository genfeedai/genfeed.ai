import { ConfigService } from '@api/config/config.service';
import { ApiKeyCategory } from '@genfeedai/enums';
import { Injectable } from '@nestjs/common';

const API_KEY_ENV_MAP: Record<
  Exclude<ApiKeyCategory, ApiKeyCategory.ELEVENLABS>,
  string
> = {
  [ApiKeyCategory.GENFEEDAI]: 'GENFEEDAI_API_KEY',
  [ApiKeyCategory.HEDRA]: 'HEDRA_KEY',
  [ApiKeyCategory.HEYGEN]: 'HEYGEN_KEY',
  [ApiKeyCategory.OPUS_PRO]: 'OPUS_PRO_KEY',
};

@Injectable()
export class ApiKeyHelperService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Get API key for a provider from environment variables
   */
  getApiKey(provider: ApiKeyCategory): string {
    if (provider === ApiKeyCategory.ELEVENLABS) {
      return String(this.configService.get<string>('ELEVENLABS_API_KEY') || '');
    }

    const envVar = API_KEY_ENV_MAP[provider];

    return envVar
      ? String(String(this.configService.get<string>(envVar) || ''))
      : '';
  }
}

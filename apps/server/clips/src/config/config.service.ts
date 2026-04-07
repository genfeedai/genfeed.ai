import { getDefaultConfigService } from '@libs/config/default.config';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ConfigService extends getDefaultConfigService() {
  get API_URL(): string {
    return this.get('GENFEEDAI_API_URL') || 'http://localhost:3010';
  }

  get FILES_URL(): string {
    return (
      this.get('GENFEEDAI_MICROSERVICES_FILES_URL') || 'http://localhost:3012'
    );
  }

  get API_KEY(): string {
    return this.get('GENFEEDAI_API_KEY') || '';
  }

  get OPENROUTER_API_KEY(): string {
    return this.get('OPENROUTER_API_KEY') || '';
  }
}

import { getDefaultConfigService } from '@libs/config/default.config';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ConfigService extends getDefaultConfigService() {
  get COMFYUI_URL(): string {
    return this.get('COMFYUI_URL') || 'http://localhost:8188';
  }

  get REDIS_URL(): string {
    return this.get('REDIS_URL') || 'redis://localhost:6379';
  }

  get API_KEY(): string {
    return this.get('GENFEEDAI_API_KEY') || '';
  }

  get AWS_ACCESS_KEY_ID(): string {
    return this.get('AWS_ACCESS_KEY_ID') || '';
  }

  get AWS_SECRET_ACCESS_KEY(): string {
    return this.get('AWS_SECRET_ACCESS_KEY') || '';
  }

  get AWS_REGION(): string {
    return this.get('AWS_REGION') || 'us-east-1';
  }

  get AWS_S3_BUCKET(): string {
    return this.get('AWS_S3_BUCKET') || '';
  }

  get COMFYUI_OUTPUT_PATH(): string {
    return this.get('COMFYUI_OUTPUT_PATH') || '/opt/ComfyUI/output';
  }
}

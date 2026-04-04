import { ConfigService } from '@api/config/config.service';
import { Injectable } from '@nestjs/common';

export interface AWSConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

@Injectable()
export class AWSConfigService {
  constructor(private configService: ConfigService) {}

  public get config(): AWSConfig {
    return {
      accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID')!,
      bucket: this.configService.get('AWS_S3_BUCKET')!,
      region: this.configService.get('AWS_REGION')!,
      secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY')!,
    };
  }

  public get region(): string {
    return this.configService.get('AWS_REGION')!;
  }

  public get accessKeyId(): string {
    return this.configService.get('AWS_ACCESS_KEY_ID')!;
  }

  public get secretAccessKey(): string {
    return this.configService.get('AWS_SECRET_ACCESS_KEY')!;
  }

  public get bucket(): string {
    return this.configService.get('AWS_S3_BUCKET')!;
  }
}

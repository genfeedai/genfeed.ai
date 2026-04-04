import { IsObject, IsOptional, IsString } from 'class-validator';

export class TestCronWebhookDto {
  @IsOptional()
  @IsString()
  readonly webhookUrl?: string;

  @IsOptional()
  @IsString()
  readonly webhookSecret?: string;

  @IsOptional()
  @IsObject()
  readonly webhookHeaders?: Record<string, string>;
}

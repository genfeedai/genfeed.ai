import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export enum HookPlatform {
  TWITTER = 'twitter',
  LINKEDIN = 'linkedin',
  INSTAGRAM = 'instagram',
  TIKTOK = 'tiktok',
}

export class GenerateHooksDto {
  @IsString()
  topic!: string;

  @IsEnum(HookPlatform)
  platform!: HookPlatform;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  count?: number = 5;

  @IsOptional()
  @IsString()
  tone?: string;

  @IsOptional()
  @IsEntityId()
  credentialId?: string;
}

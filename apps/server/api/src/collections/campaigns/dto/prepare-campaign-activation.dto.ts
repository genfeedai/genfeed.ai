import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class PrepareCampaignActivationDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsEntityId({ each: true })
  @ApiProperty({ isArray: true, required: false, type: String })
  readonly postIds?: string[];

  @IsEntityId()
  @ApiProperty()
  readonly credentialId!: string;

  @IsString()
  @MaxLength(128)
  @ApiProperty({ description: 'Provider ads account id' })
  readonly adAccountId!: string;

  @IsString()
  @MaxLength(32)
  @ApiProperty({ description: 'Ads gateway platform: meta, google, tiktok, x' })
  readonly platform!: string;

  @IsOptional()
  @IsObject()
  @ApiProperty({ required: false, type: Object })
  readonly targeting?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @ApiProperty({ required: false })
  readonly idempotencyKey?: string;
}

export class ApproveCampaignSpendDto {
  @IsString()
  @ApiProperty({
    description: 'Must be the exact string confirm to record spend approval',
  })
  readonly confirm!: string;
}

import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ContentCampaignStatus } from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CreateCampaignDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsEntityId({ each: true })
  @ApiProperty({ required: false, type: [String], maxItems: 50 })
  readonly assetIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @ApiProperty({ required: false })
  readonly audience?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @ApiProperty({ required: false })
  readonly tone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  @ApiProperty({ required: false })
  readonly creativeDirection?: string | null;

  @IsEntityId()
  @ApiProperty()
  readonly brandId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  @ApiProperty({
    description: 'Shared creative brief every release is produced from',
    required: false,
  })
  readonly brief?: string;

  @IsOptional()
  @IsDateString()
  @ApiProperty({ required: false })
  readonly endDate?: string;

  /**
   * Caller-supplied replay key. The `(organizationId, idempotencyKey)` unique
   * index makes a retried create return the existing winner instead of a
   * duplicate campaign.
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @ApiProperty({ required: false })
  readonly idempotencyKey?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @ApiProperty()
  readonly name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @ApiProperty({ required: false })
  readonly objective?: string;

  @IsOptional()
  @IsDateString()
  @ApiProperty({ required: false })
  readonly startDate?: string;

  @IsOptional()
  @IsEnum(ContentCampaignStatus)
  @ApiProperty({
    enum: ContentCampaignStatus,
    enumName: 'ContentCampaignStatus',
    required: false,
  })
  readonly status?: ContentCampaignStatus;
}

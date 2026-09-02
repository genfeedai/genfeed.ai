import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { FORBID_NON_WHITELISTED } from '@api/helpers/pipes/validation.pipe';
import { ContentCampaignStatus } from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

function toOptionalBoolean({ value }: { value: unknown }): unknown {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (value === 'true' || value === true) {
    return true;
  }
  if (value === 'false' || value === false) {
    return false;
  }
  return value;
}

/**
 * `brandId`, `page`, `limit` and `sort` are inherited from {@link BaseQueryDto}.
 * `userId` narrows the list to campaigns a single operator created.
 */
export class CampaignsQueryDto extends BaseQueryDto {
  static readonly [FORBID_NON_WHITELISTED] = true;

  @ApiProperty({
    description:
      'Include archived campaigns when no status filter is set. Default lists hide archived rows.',
    required: false,
  })
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  includeArchived?: boolean;

  @ApiProperty({
    description: 'Filter campaigns by lifecycle status',
    enum: ContentCampaignStatus,
    enumName: 'ContentCampaignStatus',
    required: false,
  })
  @IsOptional()
  @IsEnum(ContentCampaignStatus)
  status?: ContentCampaignStatus;

  /**
   * Better Auth user ids are opaque: production holds both legacy base62
   * values and UUIDs, so this is validated as a non-empty string rather than
   * a Genfeed entity id.
   */
  @ApiProperty({
    description: 'Filter campaigns by the operator who created them',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  userId?: string;
}

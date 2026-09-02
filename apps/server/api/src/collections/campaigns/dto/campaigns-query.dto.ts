import { ContentCampaignStatus } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { BaseQueryDto } from '@server/helpers/dto/base-query.dto';
import { FORBID_NON_WHITELISTED } from '@server/helpers/pipes/validation.pipe';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * `brandId`, `page`, `limit` and `sort` are inherited from {@link BaseQueryDto}.
 * `userId` narrows the list to campaigns a single operator created.
 */
export class CampaignsQueryDto extends BaseQueryDto {
  static readonly [FORBID_NON_WHITELISTED] = true;

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

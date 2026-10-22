import { FORBID_NON_WHITELISTED } from '@api/helpers/pipes/validation.pipe';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import type { TrackPostLinkInput } from '@genfeedai/contracts/interfaces/content/extension-publication.interface';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class TrackPostLinkDto implements TrackPostLinkInput {
  static readonly [FORBID_NON_WHITELISTED] = true;

  @IsEntityId()
  @ApiProperty()
  readonly brandId!: string;

  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  @ApiProperty()
  readonly url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  @ApiProperty({ required: false })
  readonly title?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  @ApiProperty({ required: false })
  readonly publishedAt?: string;
}

import type {
  BrandRemixDraftEdits,
  BrandRemixSourceSelector,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateBrandRemixRunDto {
  @ApiProperty({
    description:
      'Stable source selector. Source content, evidence, metrics, and URLs are resolved by the server.',
    type: Object,
  })
  @IsObject()
  source!: BrandRemixSourceSelector;

  @ApiProperty({ required: false, type: Object })
  @IsOptional()
  @IsObject()
  edits?: BrandRemixDraftEdits;
}

export class ReviseBrandRemixRunDto {
  @ApiProperty({ type: Object })
  @IsObject()
  edits!: BrandRemixDraftEdits;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedRevision!: number;
}

export class StartBrandRemixRunDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedRevision!: number;
}

export class SubmitBrandRemixRunForReviewDto {
  @ApiProperty({ maxItems: 8, required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  variantIds?: string[];
}

class PausedMetaCampaignDestinationDto {
  @ApiProperty()
  @IsString()
  adAccountId!: string;

  @ApiProperty()
  @IsString()
  credentialId!: string;
}

export class PreparePausedMetaCampaignDraftDto {
  @ApiProperty({ type: PausedMetaCampaignDestinationDto })
  @ValidateNested()
  @Type(() => PausedMetaCampaignDestinationDto)
  destination!: PausedMetaCampaignDestinationDto;

  @ApiProperty({
    description:
      'X Ads only: id of an existing tweet to promote. Required when the run targets X.',
    required: false,
  })
  @IsOptional()
  @IsString()
  sourceTweetId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  variantId?: string;
}
